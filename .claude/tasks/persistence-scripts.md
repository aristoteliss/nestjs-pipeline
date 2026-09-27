# Task Context

## Task

Deduplicate the api's migration and maintenance scripts. Part of
[persistence-refactor](persistence-refactor.md).

## Goal

Each script contains only its own work; the entry-point handling, the per-tenant loop and the
engine branches exist once.

## Scope

In scope: `api/src/persistence/migrate.ts`, `revert.ts`, `purge-sessions.ts`,
`rebuild-user-permissions.ts`, `verify-user-permissions.ts`, `tenant-orms.ts`,
`migrations/Migration20260830000000.ts` (seed tenant only), `migration-commands.spec.ts`,
`api/test/postgres-migrations.e2e-spec.ts`, and the `package.json` scripts.

Out of scope: what each maintenance job does.

## Current Status

not started. Depends on: tenant-store.

## Plan

- [ ] One entry-point helper replaces the `process.argv[1].endsWith(...)` block repeated in
      all five scripts.
- [ ] A per-tenant migrator helper replaces the `postgres ? migrator.up({ schema }) : up()`
      branches in `migrate.ts` and `revert.ts`, including PostgreSQL schema creation.
      Generic parts go to `@cqrs-ddd/mikro-orm`; the application part stays.
- [ ] Stop passing the tenant to the seed migration by setting `process.env.SEED_TENANT`
      around each run (`migrate.ts:11-24`, read at `Migration20260830000000.ts:408`). Find a
      way to pass it that does not mutate global state; do not rewrite the applied migration's
      schema changes (api/CLAUDE.md).
- [ ] Move `capability-row.mapper.ts` out of the persistence root to the feature that owns
      it, and delete `cache/memory.cache.spec.ts` (it tests core's `MemoryCache`; move any
      case core's spec lacks into core).

## Decisions

- None yet.

## Modified Files

None yet.

## Tests and Verification

Not run.

## Risks

- The seed migration is already applied. Changing how it reads its tenant must keep
  `Migration20260830000000.spec.ts` and the PostgreSQL migration e2e suite green.

## Open Questions

- How the seed migration receives its tenant without `process.env`. Needs a look at what
  MikroORM's migrator can pass to a migration.

## Next Steps

Extract the entry-point helper; it is independent of the other steps.

## Snapshot Impact

Yes: Commands, if any script path changes.

## Last Updated

2026-09-27
