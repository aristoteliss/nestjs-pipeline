# Task Context

## Task

Refactor the persistence layer: make `@cqrs-ddd/core` ORM- and driver-agnostic, extract the
shared MikroORM and dialect logic into a new package, and remove the duplicated
PostgreSQL/SQLite code in `api/src/persistence`. This file is the umbrella; each step is its
own task file.

## Goal

- `@cqrs-ddd/core` depends on no ORM and holds no PostgreSQL- or SQLite-specific knowledge.
- `@cqrs-ddd/mikro-orm` (`packages/ddd-mikro-orm`) holds every reusable MikroORM and dialect
  building block, including multi-tenant `EntityManager` handling.
- `api/src/persistence` keeps only application wiring: NestJS providers, HTTP middleware,
  environment reading in one place, entity schemas, migrations and thin scripts.
- Every task below is marked done, and the repository checks pass (`pnpm test`, `pnpm lint`,
  `pnpm lint:persistence`, `pnpm check`, `pnpm test:e2e`, `pnpm test:release`).

## Scope

In scope: `packages/ddd-core`, the new `packages/ddd-mikro-orm`, `api/src/persistence`, the
api repositories that import persistence types, `biome/plugins/`, docs and context files.

Out of scope: application schemas and migrations content (except the seed-tenant handoff),
`@nestjs-pipeline/*` behavior packages.

## Current Status

in progress — root-entity-version, mikro-orm-package and persistence-config done.

## Plan

Order matters: each task lists what it depends on.

- [x] root-entity-version — `version` accessor into `RootEntity` (commit `2ef9ac58`; task file
      removed).
- [x] mikro-orm-package — `@cqrs-ddd/mikro-orm` created; core imports no ORM (task file
      removed).
- [ ] [persistence-dialects](persistence-dialects.md) — move PostgreSQL/SQLite knowledge out
      of core behind a dialect contract.
- [ ] [core-persistence-layout](core-persistence-layout.md) — restructure what remains in
      `packages/ddd-core/persistence`.
- [x] persistence-config — one reader for engine, tenants and ORM options; shared
      `isSqlIdentifier` (task file removed).
- [ ] [tenant-store](tenant-store.md) — replace the two api stores with one tenant-aware
      store from the new package.
- [ ] [persistence-scripts](persistence-scripts.md) — deduplicate the migration and
      maintenance scripts.
- [x] tenant-context (fail-closed step) — no default-tenant fallback (task file removed; the
      rest moved to execution-context).
- [ ] [execution-context](execution-context.md) — tenant, principal and correlation carried
      into jobs; a decorator for system jobs; one tenant source.

## Decisions

- New package rather than moving shared code into the api: the code is reusable by any
  MikroORM application, and `packages/ddd-core/CLAUDE.md` forbids generic persistence blocks
  in an application.
- `@cqrs-ddd/mikro-orm` is framework-neutral like the rest of the `@cqrs-ddd/*` group: no
  NestJS, peers `@cqrs-ddd/core` and `@mikro-orm/core` only, no driver package import.
  Drivers (`@mikro-orm/libsql`, `@mikro-orm/postgresql`) stay in the api, which passes them
  in through ORM options.
- NestJS glue (lifecycle hooks, DI tokens, middleware, HTTP exceptions, loggers) stays in the
  api.
- Tasks mikro-orm-package, persistence-dialects and core-persistence-layout ship as one
  breaking release of `@cqrs-ddd/core` and the first release of `@cqrs-ddd/mikro-orm`, so
  consumers migrate once.

## Modified Files

- `.claude/tasks/*.md` — task files created; `ddd-mikro-orm-package.md` renamed to
  `mikro-orm-package.md`.

## Tests and Verification

Nothing run. The findings in each task come from reading the source on 2026-09-27 at commit
`10471957`.

## Risks

- Breaking changes to two published import paths (`@cqrs-ddd/core/persistence`,
  `@cqrs-ddd/core/application`).
- Tenant isolation: the store, config and context tasks touch the code that selects a
  tenant's database or schema. Each must keep `api/test/store-context.spec.ts` and the tenant
  e2e suites green.

## Open Questions

- Resolved 2026-09-27: the package split is approved; `@cqrs-ddd/core` is not published
  yet, so breaking changes to it cost nothing.
- Resolved 2026-09-27: dialect selection (registered default plus per-decorator override) and
  unique mappings keyed by property; see persistence-dialects.
- Resolved 2026-09-27: one strict tenant parsing rule for both engines; see
  persistence-config.
- Package directory and npm name: `packages/ddd-mikro-orm` / `@cqrs-ddd/mikro-orm` proposed.

## Next Steps

execution-context: three design questions are open in its task file.

## Snapshot Impact

Yes: new package, new dependency edges, changed entry points. The last task to finish runs
`pnpm context:update` and hand-edits Architecture, Critical Modules, Conventions and Gotchas.

## Last Updated

2026-09-27
