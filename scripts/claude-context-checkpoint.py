#!/usr/bin/env python3
# Copyright (C) 2026-present Aristotelis — see repository license.
"""Write a small local checkpoint before Claude Code compacts its context.

Wired as a `PreCompact` hook in `.claude/settings.json`. It records only repository
state that is already on disk: git branch/commit, changed paths, and the task context
files that exist. It never reads the conversation, never reads file contents, never
touches `.claude/tasks/`, and always exits 0 so compaction is never blocked.

Output: `.claude/state/context-checkpoint.md` (gitignored, rewritten in place).
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

STATE_RELPATH = ".claude/state/context-checkpoint.md"
MAX_LISTED_PATHS = 40


def git(root: Path, *args: str) -> str:
    try:
        completed = subprocess.run(
            ["git", *args],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return completed.stdout.strip() if completed.returncode == 0 else ""


def repo_root() -> Path:
    here = Path(__file__).resolve().parent.parent
    resolved = git(here, "rev-parse", "--show-toplevel")
    return Path(resolved) if resolved else here


def read_trigger() -> str:
    if sys.stdin is None or sys.stdin.isatty():
        return "unknown"
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except (json.JSONDecodeError, OSError, ValueError):
        return "unknown"
    trigger = payload.get("trigger") if isinstance(payload, dict) else None
    return trigger if trigger in ("auto", "manual") else "unknown"


def changed_paths(root: Path) -> list:
    status = git(root, "status", "--porcelain")
    paths = []
    for line in status.splitlines():
        candidate = line[3:].strip().strip('"')
        if candidate:
            paths.append(candidate.split(" -> ")[-1])
    return sorted(set(paths))


def task_files(root: Path) -> list:
    tasks_dir = root / ".claude" / "tasks"
    if not tasks_dir.is_dir():
        return []
    return sorted(
        f".claude/tasks/{entry.name}"
        for entry in tasks_dir.iterdir()
        if entry.is_file() and entry.suffix == ".md" and entry.name != "TEMPLATE.md"
    )


def build(root: Path, trigger: str) -> str:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    paths = changed_paths(root)
    shown = paths[:MAX_LISTED_PATHS]
    tasks = task_files(root)
    lines = [
        "# Context checkpoint",
        "",
        "Local, machine-generated state written before context compaction. Not committed.",
        "It holds repository pointers only — no conversation content and no file contents.",
        "",
        f"- Written at: {now}",
        f"- Compaction trigger: {trigger}",
        f"- Git branch: {git(root, 'rev-parse', '--abbrev-ref', 'HEAD') or 'Unknown'}",
        f"- Git commit: {git(root, 'rev-parse', 'HEAD') or 'Unknown'}",
        f"- Changed paths: {len(paths)}",
        "",
        "## Re-read after compaction",
        "",
        "1. `CLAUDE.md`",
        "2. `AGENTS.md`",
        "3. `.claude/codebase-map.md`",
        "4. The active task context file below, if any",
        "5. The nested `CLAUDE.md` for the area in scope",
        "",
        "## Task context files",
        "",
    ]
    if tasks:
        lines.extend(f"- `{task}`" for task in tasks)
    else:
        lines.append("- none (create one from `.claude/tasks/TEMPLATE.md` for multi-session work)")
    lines.extend(["", "## Working tree at checkpoint time", ""])
    if shown:
        lines.extend(f"- `{path}`" for path in shown)
        if len(paths) > len(shown):
            lines.append(f"- … and {len(paths) - len(shown)} more")
    else:
        lines.append("- clean")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    try:
        root = repo_root()
        trigger = read_trigger()
        target = root / STATE_RELPATH
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(build(root, trigger), encoding="utf-8")
    except Exception:  # noqa: BLE001 - a hook must never block compaction
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
