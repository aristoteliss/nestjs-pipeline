#!/usr/bin/env python3
# Copyright (C) 2026-present Aristotelis — see repository license.
"""Validate the repository context-management files.

Usage:
    python3 scripts/validate-claude-context.py
    python3 scripts/validate-claude-context.py --skip-generator   # structural checks only

Exit status is 0 when every check passes and 1 otherwise.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REQUIRED_FILES = (
    "CLAUDE.md",
    ".claude/codebase-map.md",
    ".claude/tasks/TEMPLATE.md",
    "scripts/update-claude-snapshot.py",
)

SNAPSHOT_RELPATH = ".claude/codebase-map.md"

REQUIRED_HEADINGS = (
    "# Codebase Map",
    "## Purpose",
    "## Repository Shape",
    "## Technology Stack",
    "## Entry Points",
    "## Directory Map",
    "## Architecture",
    "## Critical Modules",
    "## Dependencies and Integrations",
    "## Conventions",
    "## Commands",
    "## Testing Strategy",
    "## Security and Operational Notes",
    "## Important Gotchas",
    "## Snapshot Metadata",
)

REQUIRED_METADATA_FIELDS = (
    "- Generated at:",
    "- Git commit:",
    "- Git branch:",
    "- Uncommitted changes when generated:",
    "- Generator:",
    "- Snapshot status:",
    "- Included top-level directories:",
    "- Excluded directory names:",
)

SECRET_PATTERNS = (
    ("private key block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("ssh private key", re.compile(r"-----BEGIN OPENSSH PRIVATE KEY-----")),
    (
        "credential assignment",
        re.compile(
            r"(?i)\b(?:api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key)\b\s*[:=]\s*['\"]?[A-Za-z0-9/+=_\-]{12,}"
        ),
    ),
    ("aws access key id", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("github token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b")),
    ("openai-style token", re.compile(r"\bsk-[A-Za-z0-9]{24,}\b")),
    ("jwt literal", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    (
        "connection string with credentials",
        re.compile(r"\b[a-z][a-z0-9+.\-]*://[^\s/:@]+:[^\s/:@]+@[^\s]+"),
    ),
)

MAX_SNAPSHOT_BYTES = 65_536
WARN_SNAPSHOT_BYTES = 49_152

PATH_REF_RE = re.compile(r"`([A-Za-z0-9_][A-Za-z0-9_./@ -]*?/[A-Za-z0-9_./@-]*)`")


class Report:
    def __init__(self) -> None:
        self.failures: list = []
        self.warnings: list = []
        self.passed: list = []

    def check(self, ok: bool, name: str, detail: str = "") -> bool:
        if ok:
            self.passed.append(name)
        else:
            self.failures.append(f"{name}{f': {detail}' if detail else ''}")
        return ok

    def warn(self, name: str) -> None:
        self.warnings.append(name)


def find_repo_root(start: Path) -> Path:
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=str(start),
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if completed.returncode == 0 and completed.stdout.strip():
            return Path(completed.stdout.strip())
    except (OSError, subprocess.SubprocessError):
        pass
    for candidate in [start, *start.parents]:
        if (candidate / ".git").exists():
            return candidate
    return start


def check_required_files(root: Path, report: Report) -> None:
    for rel in REQUIRED_FILES:
        report.check((root / rel).is_file(), f"required file exists: {rel}")


def check_headings(snapshot: str, report: Report) -> None:
    lines = snapshot.splitlines()
    for heading in REQUIRED_HEADINGS:
        report.check(heading in lines, f"snapshot heading present: {heading}")


def check_metadata(snapshot: str, report: Report) -> None:
    for field in REQUIRED_METADATA_FIELDS:
        report.check(field in snapshot, f"snapshot metadata field present: {field.strip()}")
    report.check(
        bool(re.search(r"- Generated at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", snapshot)),
        "snapshot timestamp is ISO 8601 UTC",
    )


def check_secrets(snapshot: str, report: Report) -> None:
    for label, pattern in SECRET_PATTERNS:
        match = pattern.search(snapshot)
        report.check(
            match is None,
            f"snapshot free of {label}",
            f"matched at offset {match.start()}" if match else "",
        )


def check_size(root: Path, report: Report) -> None:
    size = (root / SNAPSHOT_RELPATH).stat().st_size
    report.check(
        size <= MAX_SNAPSHOT_BYTES,
        "snapshot within size budget",
        f"{size} bytes exceeds {MAX_SNAPSHOT_BYTES}",
    )
    if size > WARN_SNAPSHOT_BYTES:
        report.warn(f"snapshot is {size} bytes, approaching the {MAX_SNAPSHOT_BYTES} byte limit")


def check_referenced_paths(root: Path, snapshot: str, report: Report) -> None:
    missing: list = []
    for match in PATH_REF_RE.finditer(snapshot):
        raw = match.group(1).strip()
        if raw.endswith("/"):
            raw = raw[:-1]
        if not raw or raw.startswith(("http", "@", "*", "!")) or " " in raw or "*" in raw:
            continue
        if raw.startswith("."):
            head = raw.split("/")[0]
            if head not in {".claude", ".agents", ".github", ".vscode"}:
                continue
        target = root / raw
        if target.exists():
            continue
        # Build output and generated artifacts are legitimately absent before a build.
        if any(part in {"dist", "build", "coverage", "node_modules"} for part in raw.split("/")):
            continue
        missing.append(raw)
    report.check(
        not missing,
        "snapshot path references resolve",
        ", ".join(sorted(set(missing))[:10]) if missing else "",
    )


def check_claude_md(root: Path, report: Report) -> None:
    text = (root / "CLAUDE.md").read_text(encoding="utf-8") if (root / "CLAUDE.md").is_file() else ""
    report.check(SNAPSHOT_RELPATH in text, "CLAUDE.md references the codebase map")
    report.check(".claude/tasks/" in text, "CLAUDE.md documents task context files")
    report.check(len(text) <= 16_384, "CLAUDE.md stays small enough to load every session")


def check_template(root: Path, report: Report) -> None:
    path = root / ".claude/tasks/TEMPLATE.md"
    text = path.read_text(encoding="utf-8") if path.is_file() else ""
    for heading in (
        "# Task Context",
        "## Task",
        "## Goal",
        "## Scope",
        "## Current Status",
        "## Plan",
        "## Decisions",
        "## Modified Files",
        "## Tests and Verification",
        "## Risks",
        "## Open Questions",
        "## Next Steps",
        "## Snapshot Impact",
        "## Last Updated",
    ):
        report.check(heading in text.splitlines(), f"task template heading present: {heading}")


def check_generator(root: Path, report: Report) -> None:
    generator = root / "scripts/update-claude-snapshot.py"
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "codebase-map.md"
        run = subprocess.run(
            [sys.executable, str(generator), "--output", str(out), "--quiet"],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
        report.check(
            run.returncode == 0,
            "generator runs successfully",
            (run.stderr.strip() or run.stdout.strip())[:300],
        )
        report.check(out.is_file() and out.stat().st_size > 0, "generator produces output")

    check_run = subprocess.run(
        [sys.executable, str(generator), "--check", "--quiet"],
        cwd=str(root),
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    report.check(
        check_run.returncode == 0,
        "snapshot is up to date (generator --check)",
        (check_run.stderr.strip() or check_run.stdout.strip())[:300],
    )


def main(argv: list) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--skip-generator", action="store_true", help="skip running the generator")
    parser.add_argument("--verbose", action="store_true", help="list every passing check")
    args = parser.parse_args(argv)

    root = find_repo_root(Path(__file__).resolve().parent.parent)
    report = Report()

    check_required_files(root, report)
    snapshot_path = root / SNAPSHOT_RELPATH
    if snapshot_path.is_file():
        snapshot = snapshot_path.read_text(encoding="utf-8")
        check_headings(snapshot, report)
        check_metadata(snapshot, report)
        check_secrets(snapshot, report)
        check_size(root, report)
        check_referenced_paths(root, snapshot, report)
    if (root / "CLAUDE.md").is_file():
        check_claude_md(root, report)
    if (root / ".claude/tasks/TEMPLATE.md").is_file():
        check_template(root, report)
    if not args.skip_generator and (root / "scripts/update-claude-snapshot.py").is_file():
        check_generator(root, report)

    if args.verbose:
        for name in report.passed:
            print(f"pass  {name}")
    for warning in report.warnings:
        print(f"warn  {warning}")
    for failure in report.failures:
        print(f"FAIL  {failure}", file=sys.stderr)

    print(
        f"{len(report.passed)} checks passed, {len(report.failures)} failed, "
        f"{len(report.warnings)} warnings"
    )
    return 1 if report.failures else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
