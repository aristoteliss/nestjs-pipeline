# CLAUDE.md

Durable working instructions for Claude Code in this repository. Keep this file short;
detail belongs in the files it points to.

## Read before a large task

1. [AGENTS.md](AGENTS.md) — working discipline and non-negotiable repository rules. It
   wins over anything here.
2. [.agents/skills/nestjs-pipeline-architecture/SKILL.md](.agents/skills/nestjs-pipeline-architecture/SKILL.md)
   — mandatory before touching CQRS handlers, pipeline behaviors, domain models,
   persistence, caching, idempotency, auth, queues, or module wiring.
3. [.claude/codebase-map.md](.claude/codebase-map.md) — the codebase map: shape, stack,
   entry points, directories, commands, gotchas.
4. The nested `CLAUDE.md` for the area you are editing, if one exists
   ([packages/](packages/CLAUDE.md), [packages/pipeline/](packages/pipeline/CLAUDE.md),
   [ddd/core/](ddd/core/CLAUDE.md), [ddd/users-api/](ddd/users-api/CLAUDE.md)).
5. The active task context file under `.claude/tasks/`, if the task has one.

## How to use the codebase map

- It is a **compact orientation map, not a replacement for reading source**. Use it to
  find where to look, then open the actual files.
- **Verify before relying on it.** Confirm any claim that drives a change against the
  source file it names.
- **Source wins.** When the map, a README, or a summary disagrees with the code, the code
  is authoritative; fix the map afterwards rather than coding to the summary.
- Sections wrapped in `context:generated-*` markers are machine-written and are rewritten
  on every regeneration. Sections wrapped in `context:manual-*` markers are human-owned and
  are preserved; edit those by hand.

## Progressive disclosure

1. Start with the map's Repository Shape, Directory Map, and Critical Modules.
2. Read only the nested `CLAUDE.md` and README files for the areas in scope.
3. Open only the modules and symbols the task touches, plus their direct callers and tests.
4. Do not scan the whole repository. Repo-wide sweeps need an explicit reason (a rename, a
   contract audit, a security review) — say what it is before doing one.

## Commands

Use repository-native commands. Never invent an equivalent, and never `npm`/`yarn` here.

| Purpose | Command |
| --- | --- |
| Install | `pnpm install` |
| Unit/integration tests (all workspaces) | `pnpm test` |
| One workspace's tests | `pnpm --filter <package-name> test` |
| End-to-end tests | `pnpm test:e2e` |
| Type checks across workspaces | `pnpm lint` |
| Persistence Grit plugin diagnostics | `pnpm lint:persistence` |
| Format and lint (Biome) | `pnpm check`, `pnpm format` |
| Build | `pnpm build` |
| Migrations (users-api) | `pnpm --filter @nestjs-pipeline/ddd-users-api db:migrate` |
| Regenerate the codebase map | `pnpm context:update` |
| Check the map is current | `pnpm context:check` |
| Validate all context files | `pnpm context:validate` |

Prefer the narrowest relevant check first; run the affected package's tests plus
`pnpm lint:persistence` before reporting architecture-sensitive work as done.

## Task context files

For any task that is large, multi-step, or likely to span sessions, create
`.claude/tasks/<task-id>.md` from [.claude/tasks/TEMPLATE.md](.claude/tasks/TEMPLATE.md).

- Use a short, stable, descriptive task id (`cache-barrier-retry`, not `fix-1`).
- Update it after each meaningful milestone: status, decisions, modified files,
  verification results, next steps.
- Record what was *verified*, not what was intended. Name commands and their outcome.
- Never put secrets, credentials, tokens, customer data, or personal information in a
  task id or a task file.
- `.claude/tasks/` is for active work. When the task is done, move anything durable to the
  place that owns it — source, a README, or `docs/reviews/` for review material — then
  delete the task file. Only `TEMPLATE.md` stays.

## Keeping the map current

Propose a map update — do not silently skip it — when a change affects architecture,
module responsibilities, dependencies, entry points, commands, or repository conventions.

1. Run `pnpm context:update` (regenerates the generated sections only).
2. Hand-edit the manual sections that the change invalidates (Architecture, Critical
   Modules, Conventions, Testing Strategy, Security and Operational Notes, Gotchas).
3. Run `pnpm context:validate`.
4. Mention the map change in your summary so the owner can review it.

## Secrets

Never place secret values, tokens, private keys, passwords, connection strings with
credentials, or personal data in `CLAUDE.md`, the codebase map, task files, or any other
context file. Environment variable **names** are fine; values are not. `.env*` files are
never read into context files.

## After compaction or when uncertain

Re-read, in this order: `CLAUDE.md` → `AGENTS.md` → `.claude/codebase-map.md` → the active
`.claude/tasks/<task-id>.md` → the nested `CLAUDE.md` for the area in scope. If a
checkpoint exists at `.claude/state/context-checkpoint.md`, read it too — it records which
task files and which working-tree paths were active before compaction.

## Writing style in this repository

`AGENTS.md` governs. In short: no decorative banners or divider comments, no narrative
signposting, no ticket or review identifiers in code or test titles, no history-telling
comments, and no production surface added only so a test can reach it.
