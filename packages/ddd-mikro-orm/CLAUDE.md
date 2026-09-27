# packages/ddd-mikro-orm — @cqrs-ddd/mikro-orm

Scope: the MikroORM 7 adapters for `@cqrs-ddd/core`. Published as `@cqrs-ddd/mikro-orm`:
treat its exports as a public contract consumed outside `api`.

Read [AGENTS.md](../../AGENTS.md), the
[architecture skill](../../.agents/skills/nestjs-pipeline-architecture/SKILL.md) and
[packages/ddd-core/CLAUDE.md](../ddd-core/CLAUDE.md) before changing anything here.

## Local architecture

One entry point, `src/index.ts`. The package implements core's ports for MikroORM; it
defines no port of its own except `IEntityManagerSource`.

## Ownership

- the aggregate repository base (`AggregateRepository`, `src/aggregate.repository.ts`);
- version-conditioned writes (`optimisticUpdate`, `optimisticDelete`, `assertAutocommit`);
- the database `IVersionedCache` (`MikroOrmCache`, `CacheEntry`, `src/cache/`);
- the root-entity schema mapping (`rootEntityProperties`, `versionProperty`,
  `UnixTimestampType`);
- the SQL identifier check (`isSqlIdentifier`), used wherever a name is interpolated into
  SQL text;
- the multi-tenant `EntityManager` source (`TenantStore`, `src/tenant-store.ts`), which
  alone decides whether a contextual manager may be reused for a tenant;
- the persistence dialect (`MikroOrmDialect`, `src/mikro-orm.dialect.ts`) and the transient
  failure classifier (`isTransientPersistenceError`, `mapPersistenceError`,
  `src/transient-error.ts`): every database error code of the stack lives here, never in
  core.

Do not add another copy of any of them anywhere.

## Boundaries

- Peers: `@cqrs-ddd/core` and `@mikro-orm/core`, both required; no runtime dependencies
  and no driver package (`src/package-manifest.spec.ts`). The application supplies the
  driver through its ORM options.
- No NestJS import (`biome/plugins/framework-independence.grit`), no `process.env`
  (`core-environment.grit`), no transport exceptions (`transport-neutral-errors.grit`).
- Import core through its layered entry points (`@cqrs-ddd/core/domain`, `/application`,
  `/persistence`), never through relative paths into its source.

## Local commands

```bash
pnpm --filter @cqrs-ddd/mikro-orm build   # the api loads dist; rebuild core first
pnpm --filter @cqrs-ddd/mikro-orm test
pnpm --filter @cqrs-ddd/mikro-orm lint    # tsc --noEmit
pnpm test:release                         # installs and loads it standalone
```

## Local testing requirements

- `vitest.config.ts` enforces 100% statements, branches, functions and lines per file.
- `src/cache/cache-adapter-conformance.spec.ts` keeps `MikroOrmCache` and core's
  `MemoryCache` behaviorally identical; keep both sides passing.
- Real-database coverage lives in `api/test/` (`mikro-orm-cache.postgres.e2e-spec.ts`,
  the update-lifecycle suites); `api/test/schema-uniques.spec.ts` builds the dialect from
  the api's real schemas and checks every unique constraint.
