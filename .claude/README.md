# Repository context management

Persistent, repository-local context for Claude Code and other coding agents. Everything
here is plain Markdown plus two dependency-free Python scripts; nothing runs during a
normal build or test.

## Files

| Path | Tracked | Purpose |
| --- | --- | --- |
| `CLAUDE.md` (repository root) | yes | Durable agent instructions: what to read, how to work, which commands to use |
| `packages/CLAUDE.md`, `packages/pipeline/CLAUDE.md`, `ddd/core/CLAUDE.md`, `ddd/users-api/CLAUDE.md` | yes | Local rules for those areas |
| `.claude/codebase-map.md` | yes | The codebase map — generated sections plus human-owned sections |
| `.claude/tasks/TEMPLATE.md` | yes | Template for task context files |
| `.claude/tasks/<task-id>.md` | yes | One file per large or multi-session task |
| `.claude/settings.json`, `.claude/settings.local.json` | no | Local Claude Code settings |
| `.claude/state/context-checkpoint.md` | no | Local pre-compaction checkpoint |

`.gitignore` ignores `.claude/*` and re-includes the tracked entries above.

## Commands

```bash
pnpm context:update     # regenerate .claude/codebase-map.md
pnpm context:check      # exit non-zero if the committed map is stale
pnpm context:validate   # structure, required headings, secret scan, size, paths, generator
```

The scripts are also directly executable without pnpm:

```bash
python3 scripts/update-claude-snapshot.py
python3 scripts/update-claude-snapshot.py --check
python3 scripts/validate-claude-context.py
python3 scripts/validate-claude-context.py --skip-generator --verbose
```

Requirements: Python 3.9+ and, optionally, `git`. No third-party Python packages. The
generator never executes project code, never reads `.env*` or key material, and never
accesses the network.

## How the map is generated

`scripts/update-claude-snapshot.py` inspects structure only: workspace manifests,
directory layout, import specifiers, `process.env.*` **names**, README first paragraphs,
and git metadata. It enumerates files through `git ls-files --cached --others
--exclude-standard`, so `.gitignore` decides what is in scope; without git it falls back to
a filesystem walk with the same exclusions.

The map has two kinds of section:

- `<!-- context:generated-start … -->` — rewritten on every run. Do not hand-edit.
- `<!-- context:manual-start … -->` — human-owned (Purpose, Architecture, Critical Modules,
  Conventions, Testing Strategy, Security and Operational Notes, Important Gotchas).
  The generator reads the current file and copies these blocks through unchanged.

`--check` compares everything except four explicitly volatile metadata fields (timestamp,
commit, branch, dirty flag), so ordinary commits do not make the map "stale" — structural
drift does.

## When to regenerate

Regenerate when architecture, modules, dependencies, entry points, commands, or
conventions change. Then update the manual sections the change invalidated, and run
`pnpm context:validate`.

There is no hook or CI job forcing regeneration; the repository has no CI configuration,
and a commit-time regeneration policy would not match how it is worked on today. If CI is
added later, `pnpm context:check` and `pnpm context:validate` are the two commands to run.

## Task context files

```bash
cp .claude/tasks/TEMPLATE.md .claude/tasks/<task-id>.md
```

Use a short, stable, non-sensitive id. Update the file after each meaningful milestone and
record verification results, not intentions.

`.claude/tasks/` holds **active** work only. When a task finishes, move whatever is
durable into the place that owns it — source or a README — and delete the task file. A completed task file left behind is a
second copy of a record nothing maintains, which is the documentation drift `AGENTS.md`
forbids. `TEMPLATE.md` is the only permanent file in this directory.

## Pre-compaction checkpoint (optional)

`.claude/settings.json` registers a `PreCompact` hook that runs
`scripts/claude-context-checkpoint.py` with a 10 second timeout. It rewrites
`.claude/state/context-checkpoint.md` with the current branch, commit, changed paths, and
the list of task files, so an agent can re-orient after its context is compacted.

It never reads the conversation, never reads file contents, never writes inside
`.claude/tasks/`, and always exits 0. Remove the `hooks` block from `.claude/settings.json`
to disable it; nothing else depends on it.
