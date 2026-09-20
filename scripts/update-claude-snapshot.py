#!/usr/bin/env python3
# Copyright (C) 2026-present Aristotelis — see repository license.
"""Regenerate the repository codebase map consumed by Claude Code.

Usage:
    python3 scripts/update-claude-snapshot.py            # rewrite .claude/codebase-map.md
    python3 scripts/update-claude-snapshot.py --check     # fail if the committed map is stale

The generator only performs structural inspection (manifests, directory layout,
import specifiers, git metadata). It never executes project code, never reads
environment or key material, and never accesses the network.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

GENERATOR_VERSION = "1.0.0"
SNAPSHOT_RELPATH = ".claude/codebase-map.md"

EXCLUDED_DIRS = frozenset(
    {
        ".cache",
        ".git",
        ".gradle",
        ".idea",
        ".mypy_cache",
        ".next",
        ".nuxt",
        ".parcel-cache",
        ".pnpm-store",
        ".pytest_cache",
        ".ruff_cache",
        ".svelte-kit",
        ".terraform",
        ".tmp",
        ".tox",
        ".turbo",
        ".venv",
        ".vscode",
        "__pycache__",
        "bower_components",
        "build",
        "coverage",
        "dist",
        "node_modules",
        "out",
        "target",
        "vendor",
        "venv",
        "virtualenv",
    }
)

# Files whose contents are never read, in addition to being kept out of quoted output.
SENSITIVE_FILE_GLOBS = (
    ".env",
    ".env.*",
    "*.env",
    "*.pem",
    "*.key",
    "*.pfx",
    "*.p12",
    "*.jks",
    "*.keystore",
    "id_rsa*",
    "id_ed25519*",
    "*credentials*",
    "*.secret",
    "secrets.*",
)

BINARY_SUFFIXES = frozenset(
    {
        ".bin",
        ".br",
        ".db",
        ".db-shm",
        ".db-wal",
        ".gif",
        ".gz",
        ".ico",
        ".jpeg",
        ".jpg",
        ".lockb",
        ".node",
        ".pdf",
        ".png",
        ".so",
        ".sqlite",
        ".tgz",
        ".wasm",
        ".webp",
        ".woff",
        ".woff2",
        ".zip",
    }
)

SOURCE_SUFFIXES = frozenset({".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"})

MAX_READ_BYTES = 262_144
MAX_WALK_FILES = 20_000

KNOWN_MANIFESTS = (
    "package.json",
    "pnpm-workspace.yaml",
    "pnpm-lock.yaml",
    "yarn.lock",
    "package-lock.json",
    "bun.lockb",
    "bun.lock",
    "pyproject.toml",
    "requirements.txt",
    "Pipfile",
    "Cargo.toml",
    "go.mod",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "Gemfile",
    "composer.json",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
    "Makefile",
    "Taskfile.yml",
    "Taskfile.yaml",
    "tsconfig.base.json",
    "biome.json",
    ".npmrc",
)

CI_GLOBS = (
    ".github/workflows/*.yml",
    ".github/workflows/*.yaml",
    ".gitlab-ci.yml",
    ".circleci/config.yml",
    "azure-pipelines.yml",
    "Jenkinsfile",
    ".drone.yml",
)

ENTRY_FILE_ROLES = {
    "main.ts": "Process entry point",
    "main.js": "Process entry point",
    "bootstrap.ts": "Application bootstrap / composition",
    "index.ts": "Package public entry (barrel)",
    "index.js": "Package public entry",
    "server.ts": "Server entry point",
    "worker.ts": "Worker entry point",
    "cli.ts": "CLI entry point",
    "tracing.ts": "Telemetry initialization (loaded before the framework)",
    "migrate.ts": "Database migration runner",
    "revert.ts": "Database migration revert runner",
}

INTEGRATION_RULES = (
    ("NestJS runtime", ("@nestjs/common", "@nestjs/core"), "Application framework and DI container"),
    ("NestJS CQRS", ("@nestjs/cqrs",), "Command/query/event buses wrapped by the pipeline"),
    ("MikroORM", ("@mikro-orm/core", "@mikro-orm/nestjs", "@mikro-orm/migrations"), "ORM, unit of work, migrations"),
    ("PostgreSQL", ("pg", "@mikro-orm/postgresql"), "Relational backend and schema-per-tenant access"),
    ("SQLite / libSQL", ("@libsql/client", "@mikro-orm/sqlite", "@mikro-orm/libsql"), "Local and test persistence backend"),
    ("Redis", ("@keyv/redis", "ioredis", "redis"), "Cache and queue backend"),
    ("BullMQ", ("bullmq", "@nestjs/bullmq"), "Background jobs and dead-letter transport"),
    ("Keyv / cache-manager", ("keyv", "cache-manager"), "Pluggable cache stores"),
    ("OpenTelemetry", ("@opentelemetry/api", "@opentelemetry/sdk-node"), "Tracing and metrics"),
    ("OpenFeature", ("@openfeature/server-sdk",), "Feature-flag evaluation"),
    ("CASL", ("@casl/ability",), "Attribute/role based authorization"),
    ("JOSE", ("jose",), "JWT signing and verification"),
    ("Zod", ("zod",), "Schema validation for DTOs and pipeline payloads"),
    ("Pino", ("nestjs-pino", "pino-http", "pino-pretty"), "Structured logging"),
    ("Fastify", ("@nestjs/platform-fastify", "@fastify/secure-session"), "Alternative HTTP adapter and sessions"),
    ("Express", ("@nestjs/platform-express",), "Default HTTP adapter"),
    ("Cockatiel", ("cockatiel",), "Retry, timeout and circuit-breaker policies"),
    ("rate-limiter-flexible", ("rate-limiter-flexible",), "Rate-limit counters"),
    ("Vitest", ("vitest",), "Test runner"),
    ("Biome", ("@biomejs/biome",), "Formatter, linter and Grit plugin host"),
    ("TypeScript", ("typescript",), "Language and type checker"),
    ("SWC", ("@swc/core", "unplugin-swc"), "Decorator-aware test transform"),
)

MANUAL_BLOCK_RE = re.compile(
    r"<!-- context:manual-start (?P<id>[a-z0-9-]+) -->\n(?P<body>.*?)\n?<!-- context:manual-end (?P=id) -->",
    re.DOTALL,
)

VOLATILE_METADATA_PREFIXES = (
    "- Generated at:",
    "- Git commit:",
    "- Git branch:",
    "- Uncommitted changes when generated:",
)

IMPORT_RE = re.compile(
    r"""(?:from\s+|import\s*\(|require\s*\(\s*)['"]([^'"\n]+)['"]"""
)
ENV_RE = re.compile(r"""process\.env(?:\.([A-Z0-9_]+)|\[\s*['"]([A-Z0-9_]+)['"]\s*\])""")


@dataclass
class PackageInfo:
    rel_dir: str
    name: str
    version: str
    private: bool
    description: str
    main: str
    scripts: dict
    dependencies: dict
    dev_dependencies: dict
    peer_dependencies: dict
    source_dirs: list = field(default_factory=list)
    has_readme: bool = False
    runnable: bool = False


@dataclass
class RepoScan:
    root: Path
    files: list
    dirs: list
    manifests: list
    ci_files: list
    packages: list
    workspace_globs: list
    imports: dict
    env_vars: dict
    extension_counts: dict
    git: dict


def is_sensitive_name(name: str) -> bool:
    return any(fnmatch.fnmatch(name, pattern) for pattern in SENSITIVE_FILE_GLOBS)


def read_text(path: Path) -> str:
    if is_sensitive_name(path.name) or path.suffix.lower() in BINARY_SUFFIXES:
        return ""
    try:
        if path.stat().st_size > MAX_READ_BYTES:
            return ""
        return path.read_text(encoding="utf-8", errors="replace")
    except (OSError, ValueError):
        return ""


def read_json(path: Path) -> dict:
    text = read_text(path)
    if not text:
        return {}
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def run_git(root: Path, *args: str) -> str:
    try:
        completed = subprocess.run(
            ["git", *args],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    if completed.returncode != 0:
        return ""
    return completed.stdout.strip()


def collect_git_metadata(root: Path) -> dict:
    commit = run_git(root, "rev-parse", "HEAD")
    branch = run_git(root, "rev-parse", "--abbrev-ref", "HEAD")
    status = run_git(root, "status", "--porcelain")
    available = bool(commit or branch or run_git(root, "rev-parse", "--is-inside-work-tree"))
    return {
        "available": available,
        "commit": commit or "Unknown",
        "branch": branch or "Unknown",
        "dirty": bool(status),
    }


def list_git_files(root: Path) -> list:
    """Tracked plus untracked-but-not-ignored files, so the map respects `.gitignore`."""
    try:
        completed = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    if completed.returncode != 0:
        return []
    return [entry for entry in completed.stdout.split("\0") if entry]


def walk_repository(root: Path) -> tuple:
    git_files = list_git_files(root)
    if git_files:
        files = []
        dirs = set()
        extension_counts: dict = {}
        for rel in git_files:
            parts = rel.split("/")
            if any(part in EXCLUDED_DIRS for part in parts[:-1]):
                continue
            files.append(rel)
            for depth in range(1, len(parts)):
                dirs.add("/".join(parts[:depth]))
            suffix = Path(rel).suffix.lower()
            if suffix:
                extension_counts[suffix] = extension_counts.get(suffix, 0) + 1
        return sorted(files), sorted(dirs), extension_counts

    files: list = []
    dirs: list = []
    extension_counts = {}
    for current, subdirs, filenames in os.walk(root):
        subdirs[:] = sorted(d for d in subdirs if d not in EXCLUDED_DIRS)
        rel_dir = Path(current).relative_to(root).as_posix()
        if rel_dir != ".":
            dirs.append(rel_dir)
        for filename in sorted(filenames):
            rel = filename if rel_dir == "." else f"{rel_dir}/{filename}"
            files.append(rel)
            suffix = Path(filename).suffix.lower()
            if suffix:
                extension_counts[suffix] = extension_counts.get(suffix, 0) + 1
            if len(files) >= MAX_WALK_FILES:
                return sorted(files), sorted(dirs), extension_counts
    return sorted(files), sorted(dirs), extension_counts


def parse_workspace_globs(root: Path) -> list:
    globs: list = []
    workspace_file = root / "pnpm-workspace.yaml"
    if workspace_file.exists():
        in_packages = False
        for raw in read_text(workspace_file).splitlines():
            line = raw.rstrip()
            if not line or line.lstrip().startswith("#"):
                continue
            if re.match(r"^packages\s*:", line):
                in_packages = True
                continue
            if in_packages:
                item = re.match(r"^\s+-\s+['\"]?([^'\"#]+?)['\"]?\s*$", line)
                if item:
                    globs.append(item.group(1).strip())
                    continue
                if not line.startswith((" ", "\t", "-")):
                    in_packages = False
    root_manifest = read_json(root / "package.json")
    workspaces = root_manifest.get("workspaces")
    if isinstance(workspaces, list):
        globs.extend(str(entry) for entry in workspaces)
    elif isinstance(workspaces, dict) and isinstance(workspaces.get("packages"), list):
        globs.extend(str(entry) for entry in workspaces["packages"])
    return sorted(set(globs))


def matches_workspace(rel_dir: str, globs: list) -> bool:
    return any(fnmatch.fnmatch(rel_dir, glob) for glob in globs)


def collect_packages(root: Path, files: list, globs: list) -> list:
    packages: list = []
    for rel in files:
        if not rel.endswith("package.json") or rel == "package.json":
            continue
        rel_dir = str(Path(rel).parent.as_posix())
        if globs and not matches_workspace(rel_dir, globs):
            continue
        manifest = read_json(root / rel)
        if not manifest.get("name"):
            continue
        scripts = manifest.get("scripts") or {}
        source_root = root / rel_dir / "src"
        if not source_root.is_dir():
            source_root = root / rel_dir
        source_dirs = sorted(
            entry.name
            for entry in source_root.iterdir()
            if entry.is_dir() and entry.name not in EXCLUDED_DIRS
        ) if source_root.is_dir() else []
        packages.append(
            PackageInfo(
                rel_dir=rel_dir,
                name=str(manifest.get("name")),
                version=str(manifest.get("version", "Unknown")),
                private=bool(manifest.get("private")),
                description=str(manifest.get("description", "")).strip(),
                main=str(manifest.get("main", "")).strip(),
                scripts={str(k): str(v) for k, v in scripts.items()},
                dependencies=manifest.get("dependencies") or {},
                dev_dependencies=manifest.get("devDependencies") or {},
                peer_dependencies=manifest.get("peerDependencies") or {},
                source_dirs=source_dirs,
                has_readme=(root / rel_dir / "README.md").exists(),
                runnable=any(key in scripts for key in ("start", "dev", "serve", "start:prod")),
            )
        )
    return sorted(packages, key=lambda pkg: pkg.rel_dir)


def normalize_specifier(specifier: str) -> str:
    if specifier.startswith((".", "/", "#")):
        return ""
    parts = specifier.split("/")
    if specifier.startswith("@") and len(parts) >= 2:
        return "/".join(parts[:2])
    if specifier.startswith("node:"):
        return ""
    return parts[0]


def index_sources(root: Path, files: list) -> tuple:
    imports: dict = {}
    env_vars: dict = {}
    for rel in files:
        if Path(rel).suffix.lower() not in SOURCE_SUFFIXES:
            continue
        text = read_text(root / rel)
        if not text:
            continue
        for match in IMPORT_RE.finditer(text):
            module = normalize_specifier(match.group(1))
            if module:
                imports.setdefault(module, set()).add(rel)
        for match in ENV_RE.finditer(text):
            name = match.group(1) or match.group(2)
            if name:
                env_vars.setdefault(name, set()).add(rel)
    return (
        {key: sorted(value) for key, value in imports.items()},
        {key: sorted(value) for key, value in env_vars.items()},
    )


def scan_repository(root: Path) -> RepoScan:
    files, dirs, extension_counts = walk_repository(root)
    globs = parse_workspace_globs(root)
    packages = collect_packages(root, files, globs)
    imports, env_vars = index_sources(root, files)
    file_set = set(files)
    manifests = [name for name in KNOWN_MANIFESTS if name in file_set]
    manifests += sorted(
        rel for rel in files if Path(rel).name == "package.json" and rel != "package.json"
    )
    ci_files = sorted(
        rel for rel in files if any(fnmatch.fnmatch(rel, glob) for glob in CI_GLOBS)
    )
    return RepoScan(
        root=root,
        files=files,
        dirs=dirs,
        manifests=manifests,
        ci_files=ci_files,
        packages=packages,
        workspace_globs=globs,
        imports=imports,
        env_vars=env_vars,
        extension_counts=extension_counts,
        git=collect_git_metadata(root),
    )


def first_paragraph(path: Path, limit: int = 220) -> str:
    text = read_text(path)
    if not text:
        return ""
    collected: list = []
    for raw in text.splitlines():
        line = raw.strip()
        skip = not line or line.startswith(("#", ">", "[!", "[![", "---", "```", "|", "-", "*"))
        if skip:
            if collected:
                break
            continue
        collected.append(line)
    if not collected:
        return ""
    paragraph = " ".join(collected)
    paragraph = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", paragraph)
    paragraph = re.sub(r"[*`_]", "", paragraph)
    paragraph = re.sub(r"\s+", " ", paragraph).strip()
    if len(paragraph) <= limit:
        return paragraph
    cut = paragraph.rfind(" ", 0, limit)
    return paragraph[: cut if cut > 0 else limit].rstrip(",;:") + "…"


def frontmatter_description(path: Path) -> str:
    text = read_text(path)
    if not text.startswith("---"):
        return ""
    end = text.find("\n---", 3)
    if end == -1:
        return ""
    block = text[3:end]
    match = re.search(r"^description:\s*(.+)$", block, re.MULTILINE)
    return re.sub(r"\s+", " ", match.group(1).strip()) if match else ""


def describe_directory(scan: RepoScan, rel_dir: str) -> str:
    contained = [pkg for pkg in scan.packages if pkg.rel_dir.startswith(f"{rel_dir}/")]
    if contained:
        return (
            f"Workspace container — {len(contained)} package(s); see the workspace table below"
        )
    manifest = read_json(scan.root / rel_dir / "package.json")
    description = str(manifest.get("description", "")).strip()
    if description:
        return description
    paragraph = first_paragraph(scan.root / rel_dir / "README.md")
    if paragraph:
        return paragraph
    for rel in sorted(
        rel for rel in scan.files if rel.startswith(f"{rel_dir}/") and rel.endswith(".md")
    ):
        described = frontmatter_description(scan.root / rel)
        if described:
            return described
    nested = sorted(
        rel
        for rel in scan.files
        if rel.startswith(f"{rel_dir}/") and Path(rel).name.lower() == "readme.md"
    )
    for candidate in nested[:1]:
        paragraph = first_paragraph(scan.root / candidate)
        if paragraph:
            return f"{paragraph} (from `{candidate}`)"
    return "Needs verification"


def cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ").strip() or "—"


def code_list(values, limit: int = 0) -> str:
    items = list(values)
    if limit and len(items) > limit:
        shown = items[:limit]
        return ", ".join(f"`{item}`" for item in shown) + f", … (+{len(items) - limit})"
    return ", ".join(f"`{item}`" for item in items) if items else "—"


def section_repository_shape(scan: RepoScan) -> str:
    published = [pkg for pkg in scan.packages if not pkg.private]
    private = [pkg for pkg in scan.packages if pkg.private]
    runnable = [pkg for pkg in scan.packages if pkg.runnable]
    lines = []
    if scan.workspace_globs:
        lines.append(
            f"- **Shape**: monorepo — workspace globs {code_list(scan.workspace_globs)} "
            f"({len(scan.packages)} workspace packages)."
        )
    else:
        lines.append("- **Shape**: single package (no workspace globs found).")
    lines.append(f"- **Publishable packages**: {len(published)} (manifest without `private: true`).")
    lines.append(f"- **Private workspaces**: {len(private)}.")
    lines.append(
        f"- **Runnable workspaces**: {len(runnable)} "
        f"({code_list([pkg.rel_dir for pkg in runnable]) if runnable else 'none detected'})."
    )
    lines.append("")
    lines.append("| Path | Package | Version | Publishable | Runnable |")
    lines.append("| --- | --- | --- | --- | --- |")
    for pkg in scan.packages:
        lines.append(
            f"| `{pkg.rel_dir}` | `{pkg.name}` | {cell(pkg.version)} | "
            f"{'no' if pkg.private else 'yes'} | {'yes' if pkg.runnable else 'no'} |"
        )
    return "\n".join(lines)


def section_technology_stack(scan: RepoScan) -> str:
    root_manifest = read_json(scan.root / "package.json")
    engines = root_manifest.get("engines") or {}
    lock_files = [name for name in ("pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb", "bun.lock") if name in scan.manifests]
    languages = sorted(
        (
            (suffix, count)
            for suffix, count in scan.extension_counts.items()
            if suffix in {".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".go", ".rs", ".rb", ".java", ".sql", ".grit", ".md"}
        ),
        key=lambda item: (-item[1], item[0]),
    )
    declared: dict = {}
    for pkg in scan.packages + [
        PackageInfo(
            rel_dir=".",
            name=str(root_manifest.get("name", "root")),
            version="",
            private=True,
            description="",
            main="",
            scripts={},
            dependencies=root_manifest.get("dependencies") or {},
            dev_dependencies=root_manifest.get("devDependencies") or {},
            peer_dependencies=root_manifest.get("peerDependencies") or {},
        )
    ]:
        for source in (pkg.dependencies, pkg.dev_dependencies, pkg.peer_dependencies):
            for name, spec in source.items():
                declared.setdefault(str(name), set()).add(str(spec))

    lines = [
        "- **Languages** (file counts, excluded directories omitted): "
        + ", ".join(f"`{suffix}` {count}" for suffix, count in languages),
        f"- **Runtime engines** (root `package.json`): "
        + (", ".join(f"`{key}` {value}" for key, value in sorted(engines.items())) or "not declared"),
        f"- **Package manager evidence**: {code_list(lock_files) if lock_files else 'no lock file found'}.",
        "",
        "| Technology | Evidence (declared) | Used in (sample) |",
        "| --- | --- | --- |",
    ]
    for label, modules, note in INTEGRATION_RULES:
        present = [module for module in modules if module in declared or module in scan.imports]
        if not present:
            continue
        importers: list = []
        for module in present:
            importers.extend(scan.imports.get(module, []))
        sample = sorted(set(importers))[:2]
        lines.append(
            f"| {cell(label)} — {cell(note)} | {code_list(present, limit=3)} | "
            f"{code_list(sample) if sample else 'declared only'} |"
        )
    return "\n".join(lines)


def script_file_targets(scan: RepoScan, command: str) -> list:
    found = []
    for match in re.finditer(r"[\w./@-]+\.(?:ts|tsx|js|mjs|cjs|py|sh)", command):
        candidate = match.group(0).lstrip("./")
        if candidate in scan.files:
            found.append(candidate)
    return sorted(set(found))


def section_entry_points(scan: RepoScan) -> str:
    rows: dict = {}

    def add(path: str, role: str, invocation: str) -> None:
        existing = rows.get(path)
        if existing is None:
            rows[path] = [role, invocation]
            return
        if invocation not in existing[1]:
            existing[1] = f"{existing[1]}; {invocation}"

    for pkg in scan.packages:
        for rel in scan.files:
            parent = str(Path(rel).parent.as_posix())
            if parent not in (pkg.rel_dir, f"{pkg.rel_dir}/src"):
                continue
            role = ENTRY_FILE_ROLES.get(Path(rel).name)
            if role:
                add(rel, role, f"workspace `{pkg.name}`")
        for script_name in sorted(pkg.scripts):
            for target in script_file_targets(scan, pkg.scripts[script_name]):
                if target.startswith(pkg.rel_dir):
                    add(
                        target,
                        ENTRY_FILE_ROLES.get(Path(target).name, "Referenced by a package script"),
                        f"`pnpm --filter {pkg.name} {script_name}`",
                    )

    root_manifest = read_json(scan.root / "package.json")
    for script_name, command in sorted((root_manifest.get("scripts") or {}).items()):
        for target in script_file_targets(scan, str(command)):
            add(target, "Referenced by a root script", f"`pnpm {script_name}`")

    for name in ("Dockerfile", "docker-compose.yml", "compose.yaml", "Makefile", "Taskfile.yml"):
        if name in scan.files:
            add(name, "Build/run definition", "Needs verification")
    for rel in scan.ci_files:
        add(rel, "CI pipeline definition", "Runs in CI")

    published = [pkg for pkg in scan.packages if pkg.main and not pkg.private]
    lines = [
        "| Path | Role | Invocation |",
        "| --- | --- | --- |",
    ]
    for path in sorted(rows):
        role, invocation = rows[path]
        marker = "" if path in scan.files else " *(not committed)*"
        lines.append(f"| `{path}`{marker} | {cell(role)} | {cell(invocation)} |")
    if published:
        lines.append("")
        lines.append(
            f"Published packages additionally expose their built `main` "
            f"({code_list(sorted({pkg.main for pkg in published}))}, produced by `pnpm build`), "
            "imported by package name."
        )
    return "\n".join(lines)


def section_directory_map(scan: RepoScan) -> str:
    top_level = sorted({rel.split("/")[0] for rel in scan.dirs})
    package_dirs = {pkg.rel_dir for pkg in scan.packages}
    lines = [
        "Only directories that carry responsibility are listed. Generated output, caches and",
        "editor/tooling directories are excluded (see Snapshot Metadata).",
        "",
        "| Directory | Responsibility | Key files |",
        "| --- | --- | --- |",
    ]
    for rel_dir in top_level:
        description = describe_directory(scan, rel_dir)
        key_files = [
            Path(rel).name
            for rel in scan.files
            if str(Path(rel).parent.as_posix()) == rel_dir and not is_sensitive_name(Path(rel).name)
        ][:4]
        lines.append(
            f"| `{rel_dir}/` | {cell(description)} | {code_list(key_files) if key_files else 'subdirectories only'} |"
        )

    root_files = [
        rel
        for rel in scan.files
        if "/" not in rel and not is_sensitive_name(rel) and Path(rel).suffix.lower() not in BINARY_SUFFIXES
    ]
    lines.append("")
    lines.append(f"Root files: {code_list(sorted(root_files), limit=14)}")

    if package_dirs:
        lines.append("")
        lines.append("### Workspace packages")
        lines.append("")
        lines.append("| Path | Package | Source layout | Docs |")
        lines.append("| --- | --- | --- | --- |")
        for pkg in scan.packages:
            layout = code_list(pkg.source_dirs, limit=10) if pkg.source_dirs else "flat (no subdirectories)"
            docs = f"[README]({pkg.rel_dir}/README.md)" if pkg.has_readme else "none"
            lines.append(f"| `{pkg.rel_dir}` | `{pkg.name}` | {layout} | {docs} |")
    return "\n".join(lines)


def section_dependencies(scan: RepoScan) -> str:
    workspace_names = {pkg.name for pkg in scan.packages}
    lines = [
        "External dependency names and declared ranges only. No credential, endpoint or",
        "environment value is read or reproduced here.",
        "",
        "| Integration | Declared in | Imported by (sample) |",
        "| --- | --- | --- |",
    ]
    for label, modules, _note in INTEGRATION_RULES:
        declared_in = sorted(
            pkg.rel_dir
            for pkg in scan.packages
            if any(
                module in pkg.dependencies or module in pkg.peer_dependencies or module in pkg.dev_dependencies
                for module in modules
            )
        )
        importers: list = []
        for module in modules:
            importers.extend(scan.imports.get(module, []))
        sample = sorted(set(importers))[:2]
        if not declared_in and not sample:
            continue
        lines.append(
            f"| {cell(label)} | {code_list(declared_in, limit=4) if declared_in else 'root only'} | "
            f"{code_list(sample) if sample else 'not imported directly'} |"
        )

    lines.append("")
    lines.append("### Declared dependencies per workspace")
    lines.append("")
    lines.append("| Workspace | Internal | External | Peers |")
    lines.append("| --- | --- | --- | --- |")
    for pkg in scan.packages:
        runtime = sorted(name for name in pkg.dependencies if name not in workspace_names)
        internal = sorted(name for name in pkg.dependencies if name in workspace_names)
        peers = sorted(pkg.peer_dependencies)
        internal_cell = (
            f"{len(internal)} workspace packages" if len(internal) > 4 else code_list(internal)
        )
        lines.append(
            f"| `{pkg.rel_dir}` | {internal_cell} | {code_list(runtime, limit=10)} | "
            f"{code_list(peers, limit=9)} |"
        )

    if scan.env_vars:
        lines.append("")
        lines.append("### Environment variables referenced in source")
        lines.append("")
        lines.append("Names only — values are never read by the generator.")
        lines.append("")
        lines.append(code_list(sorted(scan.env_vars)))
    return "\n".join(lines)


def section_commands(scan: RepoScan) -> str:
    root_manifest = read_json(scan.root / "package.json")
    root_scripts = root_manifest.get("scripts") or {}
    lines = [
        "Commands are read from manifests. The generator does not execute them; treat every",
        "row as *declared* unless you have run it yourself in this checkout.",
        "",
        "### Root scripts (`package.json`)",
        "",
        "| Command | Script body |",
        "| --- | --- |",
    ]
    for name in sorted(root_scripts):
        body = str(root_scripts[name])
        body = body if len(body) <= 110 else body[:109] + "…"
        lines.append(f"| `pnpm {name}` | `{cell(body)}` |")

    lines.append("")
    lines.append("### Workspace scripts")
    lines.append("")
    lines.append("| Workspace | Scripts |")
    lines.append("| --- | --- |")
    for pkg in scan.packages:
        lines.append(f"| `{pkg.rel_dir}` | {code_list(sorted(pkg.scripts), limit=14)} |")

    lines.append("")
    lines.append("### Context-management commands")
    lines.append("")
    lines.append("| Command | Purpose |")
    lines.append("| --- | --- |")
    lines.append("| `pnpm context:update` | Regenerate this map (`scripts/update-claude-snapshot.py`). |")
    lines.append("| `pnpm context:check` | Fail if the committed map is stale. |")
    lines.append("| `pnpm context:validate` | Run all context checks (`scripts/validate-claude-context.py`). |")
    return "\n".join(lines)


def section_metadata(scan: RepoScan, generated_at: str) -> str:
    excluded = ", ".join(f"`{name}`" for name in sorted(EXCLUDED_DIRS))
    included = code_list(sorted({rel.split("/")[0] for rel in scan.dirs}), limit=20)
    git = scan.git
    lines = [
        f"- Generated at: {generated_at}",
        f"- Git commit: {git['commit']}",
        f"- Git branch: {git['branch']}",
        f"- Uncommitted changes when generated: {'yes' if git['dirty'] else 'no'}"
        + ("" if git["available"] else " (git metadata unavailable)"),
        f"- Generator: `scripts/update-claude-snapshot.py` version {GENERATOR_VERSION}",
        f"- Snapshot status: generated — structural inspection only, no code executed",
        f"- Files inspected: {len(scan.files)}",
        f"- Included top-level directories: {included}",
        f"- Excluded directory names: {excluded}",
        "- Excluded file patterns: " + ", ".join(f"`{glob}`" for glob in SENSITIVE_FILE_GLOBS),
        "",
        "The four volatile fields above (timestamp, commit, branch, dirty flag) are ignored by",
        "`--check`, so routine commits do not mark the map stale; structural drift does.",
    ]
    return "\n".join(lines)


SEED_PURPOSE = """Describe in two or three sentences what this repository delivers. Seeded from the
root `README.md` and root `package.json`; edit freely — this block is preserved by the
generator.

{seed}
"""

SEED_ARCHITECTURE = """*Manual section — the generator never overwrites it.*

Record the layers, boundaries, request/event flow, persistence flow, external
integrations, background jobs and the authentication/authorization path. Mark anything
you have not confirmed in source as `Needs verification`.
"""

SEED_CRITICAL_MODULES = """*Manual section — the generator never overwrites it.*

For each non-trivial module record: location, responsibility, important dependencies,
invariants, common failure modes, and what must not be changed casually.
"""

SEED_CONVENTIONS = """*Manual section — the generator never overwrites it.*

Record only conventions with repository evidence (config files, lint rules, existing code).
"""

SEED_TESTING = """*Manual section — the generator never overwrites it.*

Record test locations, frameworks, naming, fixtures, mocks, integration dependencies,
environment setup and known gaps.
"""

SEED_SECURITY = """*Manual section — the generator never overwrites it.*

Record non-sensitive operational facts only: auth boundaries, secret-loading mechanism,
rate limiting, retry/idempotency behavior, logging restrictions, deployment assumptions.
Never record a secret value.
"""

SEED_GOTCHAS = """*Manual section — the generator never overwrites it.*

Every entry must cite a source path or say how it was verified.
"""


def seed_purpose(scan: RepoScan) -> str:
    root_manifest = read_json(scan.root / "package.json")
    description = str(root_manifest.get("description", "")).strip()
    readme = first_paragraph(scan.root / "README.md", limit=400)
    parts = [part for part in (description, readme) if part]
    return SEED_PURPOSE.format(seed="\n\n".join(parts) if parts else "Needs verification.")


def load_manual_blocks(path: Path) -> dict:
    if not path.exists():
        return {}
    text = read_text(path)
    return {match.group("id"): match.group("body") for match in MANUAL_BLOCK_RE.finditer(text)}


def manual_block(block_id: str, existing: dict, seed: str) -> str:
    body = existing.get(block_id, seed).rstrip()
    return (
        f"<!-- context:manual-start {block_id} -->\n"
        f"{body}\n"
        f"<!-- context:manual-end {block_id} -->"
    )


def generated_block(block_id: str, body: str) -> str:
    return (
        f"<!-- context:generated-start {block_id} -->\n"
        f"{body.rstrip()}\n"
        f"<!-- context:generated-end {block_id} -->"
    )


def build_snapshot(scan: RepoScan, existing_manual: dict, generated_at: str) -> str:
    sections = [
        "# Codebase Map",
        "",
        "Compact orientation map for automated and human readers. It is a starting point, not a",
        "substitute for reading source. Sections marked *generated* are rewritten by",
        "`scripts/update-claude-snapshot.py`; sections wrapped in `context:manual-*` markers are",
        "preserved across regeneration and are owned by humans.",
        "",
        "## Purpose",
        "",
        manual_block("purpose", existing_manual, seed_purpose(scan)),
        "",
        "## Repository Shape",
        "",
        generated_block("repository-shape", section_repository_shape(scan)),
        "",
        "## Technology Stack",
        "",
        generated_block("technology-stack", section_technology_stack(scan)),
        "",
        "## Entry Points",
        "",
        generated_block("entry-points", section_entry_points(scan)),
        "",
        "## Directory Map",
        "",
        generated_block("directory-map", section_directory_map(scan)),
        "",
        "## Architecture",
        "",
        manual_block("architecture", existing_manual, SEED_ARCHITECTURE),
        "",
        "## Critical Modules",
        "",
        manual_block("critical-modules", existing_manual, SEED_CRITICAL_MODULES),
        "",
        "## Dependencies and Integrations",
        "",
        generated_block("dependencies", section_dependencies(scan)),
        "",
        "## Conventions",
        "",
        manual_block("conventions", existing_manual, SEED_CONVENTIONS),
        "",
        "## Commands",
        "",
        generated_block("commands", section_commands(scan)),
        "",
        "## Testing Strategy",
        "",
        manual_block("testing-strategy", existing_manual, SEED_TESTING),
        "",
        "## Security and Operational Notes",
        "",
        manual_block("security-notes", existing_manual, SEED_SECURITY),
        "",
        "## Important Gotchas",
        "",
        manual_block("gotchas", existing_manual, SEED_GOTCHAS),
        "",
        "## Snapshot Metadata",
        "",
        generated_block("metadata", section_metadata(scan, generated_at)),
        "",
    ]
    return "\n".join(sections)


def strip_volatile(text: str) -> str:
    return "\n".join(
        line
        for line in text.splitlines()
        if not line.startswith(VOLATILE_METADATA_PREFIXES)
    )


def find_repo_root(start: Path) -> Path:
    resolved = run_git(start, "rev-parse", "--show-toplevel")
    if resolved:
        return Path(resolved)
    for candidate in [start, *start.parents]:
        if (candidate / ".git").exists():
            return candidate
    return start


def main(argv: list) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="compare without writing; non-zero exit when stale")
    parser.add_argument("--output", default=None, help="write to this path instead of the canonical snapshot")
    parser.add_argument("--quiet", action="store_true", help="suppress success output")
    args = parser.parse_args(argv)

    root = find_repo_root(Path(__file__).resolve().parent.parent)
    snapshot_path = root / SNAPSHOT_RELPATH
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    scan = scan_repository(root)
    content = build_snapshot(scan, load_manual_blocks(snapshot_path), generated_at)

    if args.check:
        if not snapshot_path.exists():
            print(f"stale: {SNAPSHOT_RELPATH} does not exist", file=sys.stderr)
            return 1
        current = read_text(snapshot_path)
        if strip_volatile(current) != strip_volatile(content):
            print(
                f"stale: {SNAPSHOT_RELPATH} does not match the repository. "
                "Run `python3 scripts/update-claude-snapshot.py`.",
                file=sys.stderr,
            )
            return 1
        if not args.quiet:
            print(f"up to date: {SNAPSHOT_RELPATH}")
        return 0

    target = Path(args.output) if args.output else snapshot_path
    target.parent.mkdir(parents=True, exist_ok=True)
    previous = read_text(target) if target.exists() else ""
    if strip_volatile(previous) == strip_volatile(content) and previous:
        if not args.quiet:
            print(f"unchanged: {target.relative_to(root) if target.is_relative_to(root) else target}")
        return 0
    target.write_text(content, encoding="utf-8")
    if not args.quiet:
        print(f"written: {target.relative_to(root) if target.is_relative_to(root) else target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
