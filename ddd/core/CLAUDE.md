# ddd/core — @nestjs-pipeline/ddd-core

Scope: reusable, framework-neutral DDD primitives — aggregate roots, domain events and
exceptions, command/query base classes, repository contracts, and the persistence
lifecycle decorators. Private workspace, but a reusable library contract: treat its exports
as consumed outside `ddd/users-api`.

Read [AGENTS.md](../../AGENTS.md) and the
[architecture skill](../../.agents/skills/nestjs-pipeline-architecture/SKILL.md) before
changing anything here. Orientation: [.claude/codebase-map.md](../../.claude/codebase-map.md).

## Local architecture

Three entry points, and they are the boundary consumers import from:

| Entry | Holds |
| --- | --- |
| `domain/index.ts` | `AggregateRoot`, `DomainEvent`/`RootDomainEvent`, domain exceptions, snapshot interfaces |
| `application/index.ts` | `BaseCommand`, `BaseQuery`, `CommandBaseHandler`, query options |
| `persistence/index.ts` | Repository interfaces/abstracts, `ICache`, `MemoryCache`, `optimisticUpdate`, lifecycle decorators |

`index.ts` at the package root is a compatibility barrel;
`biome/plugins/ddd-entry-points.grit` requires application code to import the layered
entry points instead.

## Important files

| File | Role |
| --- | --- |
| `application/command-base.handler.ts` | Command lifecycle; publishes and clears buffered aggregate events |
| `persistence/decorators/Cache.ts` | Write-through cache sync, CAS version compare, mutation barriers on delete/invalidate |
| `persistence/decorators/FromCache.ts` | Read-through cache, every hit rehydrated when a hydrator applies, pre/post barrier checks, bounded retries |
| `persistence/decorators/persisted-write.decorator.ts` | `@PersistedWrite`: the canonical three-decorator lifecycle for `save(aggregate)` |
| `persistence/decorators/acknowledge-persisted.decorator.ts` | Advances the persisted version baseline only after a durable write |
| `persistence/decorators/map-persistence-errors.decorator.ts` | Driver constraint errors → domain exceptions |
| `persistence/optimistic-update.ts` | Version-conditioned update, rejects outer transactions |
| `persistence/cache/memory.cache.ts` | JSON-clone detachment parity with external caches |
| `persistence/write-side-aggregate-repository.interface.ts` | Authoritative aggregate loading for commands |

## Local commands

```bash
pnpm --filter @nestjs-pipeline/ddd-core test
pnpm --filter @nestjs-pipeline/ddd-core lint     # tsc --noEmit
pnpm lint:persistence                            # Grit persistence/lifecycle diagnostics
pnpm test:e2e                                    # users-api exercises these decorators for real
```

## Local testing requirements

- Every decorator and helper has a spec next to it; cache work also has contract suites
  (`persistence/cache/versioned-cache.contract.spec.ts`,
  `persistence/decorators/*.spec.ts`, `persistence/helpers/cache-barrier.helper.spec.ts`).
- Cache changes must cover the hard races explicitly: invalidation after the last read but
  before fill, absence/expiry ABA, delete-then-recreate, and retry exhaustion. The presence
  of a barrier is not proof a race is prevented — test the coordination through the final write.
- `persistence/biome-persistence-plugin.spec.ts` and `biome-general-plugins.spec.ts` assert
  the Grit plugins still fire. Keep them passing rather than loosening the plugin.

## Local security and compatibility rules

- `ICache<TSnapshot>` stores strictly serializable snapshots — never a live aggregate.
- Write repositories use `@PersistedWrite(...)`, or apply the lifecycle decorators outermost
  to innermost: `@Cache(...)` → `@AcknowledgePersisted(...)` → `@MapPersistenceErrors(...)`.
  Inverting the order, or stacking an individual decorator on `@PersistedWrite`, is a defect,
  and `biome/plugins/persistence-lifecycle.grit` fails the build.
- `acknowledgePersisted()` may only advance after durable persistence succeeds.
- Version conflicts surface as framework-neutral `ConcurrencyConflictError`; no MikroORM
  error class may leak into application or domain code.
- No `process.env` and no transport exceptions in this package
  (`core-environment.grit`, `transport-neutral-errors.grit`).
- A defect in a cache abstraction is repaired inside the abstraction, with a regression
  test — it is not grounds for moving the feature to another layer.
