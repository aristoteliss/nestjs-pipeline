# Task Context

## Task

Restructure what remains in `packages/ddd-core/persistence` after the MikroORM and dialect
code leaves. Part of [persistence-refactor](persistence-refactor.md).

## Goal

The folder holds only ORM-neutral persistence code, with a layout and file names that follow
AGENTS.md, and no port defined in one layer while exported from another.

## Scope

In scope, all under `packages/ddd-core`:
- Ports are defined in `persistence/` but are application ports: `application/index.ts`
  re-exports `cache.interface`, `command-repository.interface`,
  `query-repository.interface` and `write-side-aggregate-repository.interface` from
  `../persistence`.
- `decorators/Cache.ts` and `decorators/FromCache.ts` break the kebab-case file rule; the
  other three decorators already use `*.decorator.ts`.
- `cache.interface.ts` and `cache-logger.ts` sit at the root beside the `cache/` folder.
- Logger code is split across `cache-logger.ts`, `helpers/cache-logger.helper.ts` and
  `helpers/cache-owner.helper.ts`.

Out of scope: `domain/decorators/ApplyMutation.ts` and `Mutable.ts` (same naming issue, other
layer; record as a follow-up).

## Current Status

not started. Depends on: persistence-dialects.

## Plan

- [ ] Move the four port interfaces to `application/ports/`; `application/index.ts` exports
      them from there. Decide whether `persistence/index.ts` keeps re-exporting them.
- [ ] Rename `Cache.ts` → `cache.decorator.ts`, `FromCache.ts` → `from-cache.decorator.ts`,
      with their specs.
- [ ] Move `cache.interface.ts` and `cache-logger.ts` into `cache/`; merge the logger helpers
      where one file suffices.
- [ ] Update `persistence/index.ts`, the README file table, and `packages/ddd-core/CLAUDE.md`.

## Decisions

- Exported symbol names do not change in this task; only files move. The import paths
  consumers use (`@cqrs-ddd/core/application`, `/persistence`) stay the same.

## Modified Files

None yet.

## Tests and Verification

Not run.

## Risks

- `persistence/index.ts` currently also exports the ports; removing that is breaking.
  Bundle it into the same release as mikro-orm-package or keep the re-export.

## Open Questions

- Does `@cqrs-ddd/core/persistence` keep re-exporting the ports? Recommended: no, ports
  come from `/application` only, released with the other breaking changes.

## Next Steps

Wait for the two dependencies, then do the file moves in one commit.

## Snapshot Impact

Yes: Directory Map (generated) and Critical Modules (manual).

## Last Updated

2026-09-27
