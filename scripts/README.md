# Repository scripts

Dependency-free Python utilities for the agent context-management system. They are not
part of the build, the test run, or the release pipeline; see
[`.claude/README.md`](../.claude/README.md) for the full system description.

| Script | Purpose | Entry command |
| --- | --- | --- |
| `update-claude-snapshot.py` | Regenerates the generated sections of `.claude/codebase-map.md`; `--check` fails when the committed map is stale | `pnpm context:update`, `pnpm context:check` |
| `validate-claude-context.py` | Verifies the context files exist, carry the required headings and metadata, stay within the size budget, reference real paths, contain no secret-shaped strings, and that the generator runs | `pnpm context:validate` |
| `claude-context-checkpoint.py` | `PreCompact` hook; rewrites the local `.claude/state/context-checkpoint.md` pointer file | Invoked by Claude Code |

Requirements: Python 3.9+, optionally `git`. No third-party packages, no network access,
no project code executed, no application files written.
