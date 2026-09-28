# packages/ddd-core — @cqrs-ddd/core

Scope: reusable, framework- and ORM-neutral DDD primitives — aggregate roots, domain events and
exceptions, command/query base classes, repository contracts, and the persistence
lifecycle decorators. Published as `@cqrs-ddd/core`: treat its exports as a public contract
consumed outside `api`.

Read [AGENTS.md](../../AGENTS.md) and the
[architecture skill](../../.agents/skills/nestjs-pipeline-architecture/SKILL.md) before
changing anything here. Orientation: [.claude/codebase-map.md](../../.claude/codebase-map.md).

## Local architecture

Four entry points, and they are the boundary consumers import from:

| Entry | Holds |
| --- | --- |
| `domain/index.ts` | `AggregateRoot`, `DomainEvent`/`RootDomainEvent`, domain exceptions, value rules (`textRule`, `numberRule`, `InvalidValueException`), snapshot interfaces |
| `application/index.ts` | `BaseCommand`, `BaseQuery`, `CommandBaseHandler`, query options |
| `persistence/index.ts` | Repository interfaces/abstracts, `ICache`, `MemoryCache`, lifecycle decorators, cache helpers |
| `http/index.ts` | `domainErrorHttpStatus`: this package's errors → HTTP status, reason phrase and safe message |

`index.ts` at the package root is a compatibility barrel;
`biome/plugins/ddd-entry-points.grit` requires application code to import the layered
entry points instead.

Names follow [AGENTS.md → Naming](../../AGENTS.md#naming): short and declarative, with no
prefix or suffix their context already gives. An exported name is a published contract.

## Ownership

Generic DDD and persistence building blocks belong here, not in an application. An
application configures and extends them. This package owns:
- the persistence dialect contract (`IPersistenceDialect`, `setPersistenceDialect`, in
  `persistence/persistence-dialect.ts`); implementations, and every database error code,
  live in adapter packages such as `@cqrs-ddd/mikro-orm`;
- the tenant context error;
- the value rules (`textRule`, `numberRule`, `ValueViolation`, in `domain/rules/`, and
  `InvalidValueException`);
- the framework-neutral mapping of this package's errors to HTTP status codes
  (`domainErrorHttpStatus`, in `http/domain-error-http-status.ts`).

Do not add another copy of any of them anywhere. MikroORM adapters, including the
aggregate repository base, `optimisticUpdate`, `MikroOrmCache` and the root-entity schema
mapping, belong to `packages/ddd-mikro-orm` (see its `CLAUDE.md`).

## Independence from NestJS and from any ORM

This package is framework- and ORM-neutral and is published as its own npm package. No
code here, specs included, may import `@nestjs/*`, another `nestjs`-named package, any
`@nestjs-pipeline/*` package, an ORM or a database driver. Nest integration, such as DI
providers, logger adapters, tenant wiring and HTTP exception filters, belongs in the
application; ORM adapters belong in their own package. Four checks enforce this:
- `biome/plugins/framework-independence.grit` rejects the NestJS imports and
  `biome/plugins/orm-independence.grit` the ORM and driver imports (`pnpm lint:persistence`);
- `package-manifest.spec.ts` rejects NestJS and MikroORM packages in every dependency
  field and allows no peer;
- `domain/domain-entry-point.spec.ts` loads every built entry point and fails if any
  NestJS or MikroORM module loads, so rebuild `dist` before running the specs.

Cache keys take their tenant from an explicit argument (`CacheKeyTenantSource`) or from
the resolver the application registers with `setTenantResolver`
(`application/tenant-resolver.ts`), never from another package's state: this package
knows nothing of where an application keeps its tenant. `requireTenant` in the same
file is the one tenant resolution path; the cache-key helpers use it too, and the
deprecated `requireTenantId` only calls it.

## Important files

| File | Role |
| --- | --- |
| `application/command-base.handler.ts` | Command lifecycle; publishes and clears buffered aggregate events |
| `persistence/decorators/cache.decorator.ts` | Write-through cache sync, CAS version compare, mutation barriers on delete/invalidate |
| `persistence/decorators/from-cache.decorator.ts` | Read-through cache, every hit rehydrated when a hydrator applies, pre/post barrier checks, bounded retries |
| `persistence/decorators/persisted-write.decorator.ts` | `@PersistedWrite`: the canonical three-decorator lifecycle for `save(aggregate)` |
| `persistence/decorators/acknowledge-persisted.decorator.ts` | Advances the persisted version baseline only after a durable write |
| `persistence/decorators/map-persistence-errors.decorator.ts` | Unique violations → domain exceptions, keyed by entity property through the persistence dialect |
| `persistence/persistence-dialect.ts` | `IPersistenceDialect` and the registered default (`setPersistenceDialect`) |
| `persistence/cache/memory.cache.ts` | JSON-clone detachment parity with external caches |
| `application/ports/` | The ports handlers depend on: repositories, `IWriteSideAggregateRepository` (authoritative loading for commands), `ICache`/`IVersionedCache`, `IDomainEventPublisher`; exported only from `/application` |

## Local commands

```bash
pnpm --filter @cqrs-ddd/core rebuild  # the entry-point spec loads dist
pnpm --filter @cqrs-ddd/core test
pnpm --filter @cqrs-ddd/core lint     # tsc --noEmit
pnpm lint:persistence                            # Grit persistence/lifecycle diagnostics
pnpm test:e2e                                    # users-api exercises these decorators for real
```

## Local testing requirements

- `vitest.config.ts` enforces 100% statements, branches, functions and lines per source
  file. Close a gap with a behavior test; no ignore directives or exclusions, and remove a
  branch only once it is proven unreachable.
- Every decorator and helper has a spec next to it; cache work also has contract suites
  (`persistence/cache/versioned-cache.contract.spec.ts`,
  `persistence/decorators/*.spec.ts`, `persistence/helpers/cache-barrier.helper.spec.ts`).
- Cache changes must cover the hard races explicitly: invalidation after the last read but
  before fill, absence/expiry ABA, delete-then-recreate, and retry exhaustion. The presence
  of a barrier is not proof a race is prevented — test the coordination through the final write.
- The repository-wide Grit plugins, including the persistence rules that apply to this
  package, are tested in `api/test/lint/`; this package's specs name no other workspace.
  Keep those specs passing rather than loosening a plugin.

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
