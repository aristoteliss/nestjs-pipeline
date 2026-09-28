# api — runnable reference application

Scope: the private example application that wires the pipeline packages and `ddd-core`
into a real NestJS service (users, roles, auth; multi-tenant persistence; queues;
observability). It is **one example, not the product boundary** — do not treat "no call
site here" as proof a library API is unused.

Read [AGENTS.md](../AGENTS.md) and the
[architecture skill](../.agents/skills/nestjs-pipeline-architecture/SKILL.md) before any
change in `src/`. Orientation: [.claude/codebase-map.md](../.claude/codebase-map.md).

## Local architecture

`src/main.ts` → `src/bootstrap.ts` (imports `./tracing` first, selects Express or Fastify,
registers global filters) → `src/app.module.ts`.

Per feature module (`users/`, `roles/`, `auths/`):

| Layer | Directory | Rule |
| --- | --- | --- |
| Presentation | `controllers/`, `decorators/`, `interceptors/`, `dtos/`, `responses/`, `mappers/` | A controller dispatches through `CommandBus`/`QueryBus` and maps the result, nothing else; in rare cases it translates an application error into another HTTP answer |
| Application | `application/cqrs/commands/`, `application/cqrs/queries/`, `application/ports/` | Depend on repository interfaces and injection tokens; never on ORM clients |
| Domain | `domain/models/`, `domain/events/`, `domain/errors/` (users and roles: `domain/models/errors/`) | Invariants inside aggregates; framework-neutral errors |
| Persistence | `persistence/` | ORM, caching, tenant access, lifecycle decorators |
| Jobs | `jobs/` | BullMQ processors and dispatcher adapters behind application ports; payloads carry `withJobContext`, processors restore it with `@InJobContext()` |

Generic DDD and persistence building blocks belong to `packages/ddd-core` (see its `CLAUDE.md`,
Ownership). `src/common/filters/domain-exception.filter.ts` maps this application's own
exceptions and takes the status for `packages/ddd-core` errors from `domainErrorHttpStatus()`
(`@cqrs-ddd/core/http`).

Keep application-specific behavior out of `packages/ddd-core`, and do not copy its code here. `packages/ddd-core` is
framework-neutral: Nest glue (DI providers, logger adapter, tenant wiring, exception
filters) for `packages/ddd-core` belongs in this application.

Cross-cutting wiring lives in `src/common/modules/` (`ObservabilityModule` — Pino, OTel,
audit, global behaviors, the add-ons' span attributes through `AttributesBehavior`;
`ReliabilityModule` — BullMQ, dead-letter, rate limit, idempotency, resilience, cache,
feature flags) and `src/common/` (guards, filters, interceptors, request context stores,
`audit/` and `dead-letter/` options, `environment/` config modules). `src/common/` holds
only this application's wiring and policy; a mechanism any consumer of a package would
need belongs in that package.

Names follow [AGENTS.md → Naming](../AGENTS.md#naming) and the skill's CQRS name shapes
(`CreateUserCommand`, `UserCreatedEvent`, `IAccessTokenIssuer` ↔ `ACCESS_TOKEN_ISSUER`):
short and declarative, with no prefix or suffix the module already gives.

## Important files

| File | Role |
| --- | --- |
| `src/main.ts` | Loads the optional env file before any environment-dependent import |
| `src/bootstrap.ts` | Adapter choice, secure session, global exception filters, signal-driven shutdown |
| `src/graceful-shutdown.ts` | SIGTERM/SIGINT → `app.close()` → telemetry flush → re-raise the signal |
| `src/app.module.ts` | Composition root: CQRS, observability, reliability, CASL, persistence, features |
| `src/common/filters/domain-exception.filter.ts` | Framework-neutral errors → HTTP: this application's exceptions, then `domainErrorHttpStatus()` for `packages/ddd-core`'s (409, 404, generic 500 for a missing tenant, 400) |
| `src/persistence/mikro-orm.store.ts` | The one store for both engines: builds the ORMs (libSQL: one per tenant; PostgreSQL: one, a schema per tenant), registers the dialect, and hands out the active tenant's `EntityManager` through `@cqrs-ddd/mikro-orm`'s `TenantStore` |
| `src/auths/services/session.service.ts` | Cookie lifecycle, kept out of domain login |
| `src/auths/persistence/casl-permission.source.ts` | Principal and rule loading for CASL (`ICaslPermissionSource`) |

## Local commands

```bash
pnpm --filter @nestjs-pipeline/ddd-api start          # ts-node, Express adapter
pnpm --filter @nestjs-pipeline/ddd-api start:fastify  # ADAPTER=fastify
pnpm --filter @nestjs-pipeline/ddd-api dev            # watch mode
pnpm --filter @nestjs-pipeline/ddd-api test           # unit + integration (vitest.config.ts)
pnpm test:e2e                                               # vitest.config.e2e.ts
pnpm --filter @nestjs-pipeline/ddd-api db:migrate     # apply migrations
pnpm --filter @nestjs-pipeline/ddd-api db:revert      # revert last migration
pnpm --filter @nestjs-pipeline/ddd-api permissions:rebuild  # rebuild user_permission_rules
pnpm --filter @nestjs-pipeline/ddd-api permissions:verify   # exit non-zero on drift
pnpm --filter @nestjs-pipeline/ddd-api sessions:purge       # delete expired/revoked sessions
pnpm --filter @nestjs-pipeline/ddd-api typecheck
```

Copy `.env.example` to `.env` for local runs. The app reads it through
`src/common/environment/load-optional-env-file.ts`; never commit a real `.env`.

## Local testing requirements

- The api resolves the workspace packages through their built `dist/`: run `pnpm build`
  (or the changed package's `build`) before api tests or `typecheck`, or they fail on
  missing or outdated package code.
- `src/**/*.spec.ts` — unit and adapter specs beside the code. `test/*.spec.ts` and
  `test/*.e2e-spec.ts` — cross-module, composition, and HTTP-level suites.
- This workspace is where integration tests that need `@nestjs/testing` belong; published
  packages must not depend on it.
- Architecture-sensitive changes need a test at the boundary they touch: persistence
  lifecycle, tenant isolation, cache/idempotency keying, authorization, or event dispatch.
  `test/` already has a suite for each of those — extend the matching one.
- Test names describe domain behavior and invariants. No ticket or review identifiers
  anywhere in file names, `describe`, or `it` strings.

## Do not edit manually

- `src/persistence/migrations/*.ts` — generated by MikroORM. Create a new migration instead
  of rewriting an applied one; `Migration20260830000000.spec.ts` pins the current schema.
- `src/persistence/*.db`, `*.db-*` — local SQLite tenant databases (gitignored).
- `dist/`, `coverage/`.

## Local security and compatibility rules

- Fastify mode refuses to boot without `SESSION_SECRET` — keep that fail-closed behavior.
- Missing tenant context fails closed with `MissingTenantContextError`; never fall back to
  a shared `'default'` namespace.
- Cache and idempotency keys must include tenant, principal, and permission scope whenever
  those change the authorized response. A pipeline hit skips the handler's entity and
  field checks; an outer type-level CASL check does not reproduce them.
- Mutating commands load aggregates through `IWriteSideAggregateRepository`, not through
  `QueryBus`, `IQueryRepository`, or a cached read.
- Entity-level authorization and field filtering run in the application path, after the
  real aggregate is available (`CaslAuthorizer`).
- Environment variables are read in bootstrap/infrastructure/configuration code only —
  never inside a use case. Use an application port instead.
- Each external system has one config module, the only reader of its variables:
  `redisConfig()` (`src/common/environment/redis.config.ts`), `persistenceConfig()`
  (`src/persistence/persistence.config.ts`), `otlpConfig()`
  (`src/common/environment/otlp.config.ts`). A new system gets its own
  `<system>.config.ts` (AGENTS.md rule 23).
- Code that needs the current tenant calls `requireTenant(purpose)` from
  `@cqrs-ddd/core/application`; there is no tenant port.
