# Codebase Map

Compact orientation map for automated and human readers. It is a starting point, not a
substitute for reading source. Sections marked *generated* are rewritten by
`scripts/update-claude-snapshot.py`; sections wrapped in `context:manual-*` markers are
preserved across regeneration and are owned by humans.

## Purpose

<!-- context:manual-start purpose -->
Reusable pipeline behaviors for **NestJS CQRS**: a middleware-like chain that wraps every
command, query and event handler with cross-cutting concerns (logging, validation,
correlation, tracing, metrics, audit, authorization, caching, idempotency, rate limiting,
resilience, feature flags, dead-lettering). Twelve of these behaviors ship as published
`@nestjs-pipeline/*` packages.

The Domain-Driven Design side: `packages/ddd-core` provides reusable DDD primitives
(aggregate roots, domain events, command/query base classes, repository contracts, the
persistence lifecycle decorators), and `api` is a runnable multi-tenant reference
application that composes everything. The example is a demonstration, not the boundary of
what the libraries support.
<!-- context:manual-end purpose -->

## Repository Shape

<!-- context:generated-start repository-shape -->
- **Shape**: monorepo — workspace globs `api`, `packages/*` (20 workspace packages).
- **Publishable packages**: 19; private: `api`.
- **Runnable workspaces**: `api`.
- **Versions**: `0.2.0`, `0.2.1`.
- **Packages**: see the Workspace packages table under Directory Map.
<!-- context:generated-end repository-shape -->

## Technology Stack

<!-- context:generated-start technology-stack -->
- **Languages** (file counts, excluded directories omitted): `.ts` 794, `.md` 36, `.grit` 14, `.py` 3, `.mjs` 1
- **Runtime engines** (root `package.json`): `node` >=22.0.0, `pnpm` >=9.0.0
- **Package manager evidence**: `pnpm-lock.yaml`.
- **Integrations**: listed with their purpose under Dependencies and Integrations.
<!-- context:generated-end technology-stack -->

## Entry Points

<!-- context:generated-start entry-points -->
| Path | Role | Invocation |
| --- | --- | --- |
| `api/src/bootstrap.ts` | Application bootstrap / composition | workspace `@nestjs-pipeline/ddd-api` |
| `api/src/main.ts` | Process entry point | workspace `@nestjs-pipeline/ddd-api`; `pnpm --filter @nestjs-pipeline/ddd-api` `dev`, `start`, `start:fastify` |
| `api/src/persistence/cli.ts` | CLI entry point | `pnpm --filter @nestjs-pipeline/ddd-api` `db:migrate`, `db:revert`, `permissions:rebuild`, `permissions:verify`, `sessions:purge` |
| `api/src/tracing.ts` | Telemetry initialization (loaded before the framework) | workspace `@nestjs-pipeline/ddd-api` |
| `api/vitest.config.e2e.ts` | Referenced by a package script | `pnpm --filter @nestjs-pipeline/ddd-api` `test:e2e`, `test:e2e:watch` |
| `integration/packages/release.mjs` | Referenced by a root script | `pnpm test:release` |
| `packages/ddd-core/index.ts` | Package public entry (barrel) | workspace `@cqrs-ddd/core` |
| `scripts/update-claude-snapshot.py` | Referenced by a root script | `pnpm context:check`; `pnpm context:update` |
| `scripts/validate-claude-context.py` | Referenced by a root script | `pnpm context:validate` |

Package public entry (barrel): `<package>/src/index.ts` in 18 workspace packages; exceptions are listed above.

Published packages additionally expose their built `main` (`dist/index.js`, produced by `pnpm build`), imported by package name.
<!-- context:generated-end entry-points -->

## Directory Map

<!-- context:generated-start directory-map -->
Only directories that carry responsibility are listed. Generated output, caches and
editor/tooling directories are excluded (see Snapshot Metadata).

| Directory | Responsibility |
| --- | --- |
| `.agents/` | Guide architecture-sensitive implementation, reviews and documentation in nestjs-pipeline, preserving reusable library contracts and DDD boundaries. |
| `.claude/` | Needs verification |
| `api/` | Sample NestJS app demonstrating @nestjs-pipeline/core usage |
| `biome/` | Needs verification |
| `integration/` | Needs verification |
| `packages/` | Workspace container — 19 package(s); see the workspace table below |
| `scripts/` | Needs verification |

Root files: `.gitignore`, `.npmrc`, `AGENTS.md`, `CHANGELOG.md`, `CLAUDE.md`, `COMMERCIAL_LICENSE.txt`, `LICENSE`, `Packages.Guide.el.md`, `README.md`, `biome.json`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`

### Workspace packages

Each has a `README.md`.

| Path | Package | Source layout |
| --- | --- | --- |
| `api` | `@nestjs-pipeline/ddd-api` | `auths`, `common`, `persistence`, `roles`, `users` |
| `packages/ddd-core` | `@cqrs-ddd/core` | `application`, `domain`, `http`, `persistence`, `types` |
| `packages/ddd-mikro-orm` | `@cqrs-ddd/mikro-orm` | `cache`, `concurrency`, `errors`, `helpers`, `interfaces`, `mapping`, `repository`, `tenancy` |
| `packages/pipeline` | `@nestjs-pipeline/core` | `behaviors`, `constants`, `decorators`, `errors`, `helpers`, `interfaces`, `options`, `services` |
| `packages/pipeline-audit` | `@nestjs-pipeline/audit` | `constants`, `helpers`, `interfaces`, `sinks` |
| `packages/pipeline-cache` | `@nestjs-pipeline/cache` | `adapters`, `constants`, `errors`, `helpers`, `interfaces` |
| `packages/pipeline-casl` | `@nestjs-pipeline/casl` | `constants`, `errors`, `filters`, `helpers`, `interfaces`, `types` |
| `packages/pipeline-correlation` | `@nestjs-pipeline/correlation` | `constants`, `decorators`, `middlewares`, `options`, `types` |
| `packages/pipeline-deadletter` | `@nestjs-pipeline/deadletter` | `constants`, `errors`, `helpers`, `interfaces`, `transports` |
| `packages/pipeline-feature-flags` | `@nestjs-pipeline/feature-flags` | `constants`, `errors`, `filters`, `helpers`, `interfaces` |
| `packages/pipeline-idempotency` | `@nestjs-pipeline/idempotency` | `constants`, `errors`, `filters`, `helpers`, `interfaces`, `stores` |
| `packages/pipeline-job-context` | `@nestjs-pipeline/job-context` | `constants`, `decorators`, `errors`, `helpers`, `interfaces` |
| `packages/pipeline-opentelemetry` | `@nestjs-pipeline/opentelemetry` | `helpers` |
| `packages/pipeline-rate-limit` | `@nestjs-pipeline/rate-limit` | `constants`, `errors`, `filters`, `helpers`, `interfaces` |
| `packages/pipeline-resilience` | `@nestjs-pipeline/resilience` | `constants`, `errors`, `helpers`, `interfaces` |
| `packages/pipeline-tenant` | `@nestjs-pipeline/tenant` | flat |
| `packages/pipeline-zod` | `@nestjs-pipeline/zod` | `errors`, `filters`, `helpers`, `pipes` |
| `packages/safe-stringify` | `@cqrs-ddd/safe-stringify` | flat |
| `packages/untyped` | `@cqrs-ddd/untyped` | flat |
| `packages/uuidv7` | `@cqrs-ddd/uuidv7` | flat |
<!-- context:generated-end directory-map -->

## Architecture

<!-- context:manual-start architecture -->
*Manual section — the generator never overwrites it. Verify each claim against the source
path given before relying on it.*

### Layers

| Layer | Where | Depends on |
| --- | --- | --- |
| Presentation | `api/src/*/controllers`, `decorators`, `interceptors`, `dtos`, `responses`, `mappers`, `api/src/common/filters`, `guards`, `interceptors` | Command/Query buses only; controllers dispatch and map |
| Application (CQRS) | `api/src/*/application/cqrs`, `api/src/*/application/ports` | Repository/port interfaces and injection tokens |
| Domain | `api/src/*/domain`, `packages/ddd-core/domain` | Nothing framework-specific |
| Persistence | `api/src/persistence`, `src/*/persistence`, `packages/ddd-core/persistence` | MikroORM, cache adapters |
| Pipeline / cross-cutting | `packages/*`, wired in `api/src/common/modules/*.module.ts` | NestJS CQRS |

The direction is strictly inward: presentation → application → domain. Persistence
implements application-owned interfaces. Biome Grit plugins enforce the crossings
(`biome/plugins/ddd-layering.grit`, `handler-boundaries.grit`, `ddd-entry-points.grit`,
`transport-neutral-errors.grit`). `packages/ddd-core` depends on no NestJS or `@nestjs-pipeline/*`
package; users-api supplies the Nest glue (`framework-independence.grit`,
`packages/ddd-core/package-manifest.spec.ts`).

### Request flow

`HTTP request` → `HttpCorrelationMiddleware` + `TenantSchemaMiddleware`
(`api/src/app.module.ts` `configure()`) → `AuthSessionGuard` (global `APP_GUARD`) →
`SessionPrincipalContextInterceptor` (global `APP_INTERCEPTOR`) → controller (`ZodPipe`
validation) → `CommandBus`/`QueryBus` → pipeline chain (order under Pipeline engine;
global behaviors in `api/src/common/modules/observability.module.ts`) → handler.

### Persistence flow

Commands load aggregates through `IWriteSideAggregateRepository` →
`AggregateRepository` (`packages/ddd-mikro-orm/src/`; `{ refresh: true }`, bypasses
`@FromCache` and the identity map) → domain method uses `applyPatch(...)` and returns `this`; `@ApplyMutation` advances the lifecycle and records events → `ICommandRepository.save()` →
`@PersistedWrite` (= `@Cache` → `@AcknowledgePersisted` → `@MapPersistenceErrors`) → MikroORM. Updates are
version-conditioned (`packages/ddd-mikro-orm/src/concurrency/optimistic-update.ts`), deletes are conditional
on `{ id, version }`. `CommandBaseHandler` publishes the aggregate's buffered events after
the handler returns.

Queries go through `IQueryRepository`: `@FromCache` plus a repository-level `{ hydrateFn }`
passed to `QueryRepository`, and return domain aggregates; entity/field authorization runs afterwards via
`CaslAuthorizer` in the handler.

### Errors

Domain and application code throw framework-neutral errors
(`packages/ddd-core/domain/exceptions/`). `api/src/common/filters/domain-exception.filter.ts` maps them:
`ConcurrencyConflictError` → 409, `EntityNotFoundException` → 404, unique-constraint
exceptions → 409, invariant violations → 422, `InvalidLoginCredentialsException` → 401,
`AuthConfigurationException` → 500, otherwise 400. `ZodValidationFilter`,
`RateLimitExceededFilter`, `IdempotencyConflictFilter`, `FeatureDisabledFilter` and
`UnauthorizedActionFilter` are registered in `api/src/bootstrap.ts`.

### Background jobs

BullMQ over Redis, wired in `api/src/common/modules/reliability.module.ts`. Processors live in
`api/src/users/jobs/` (`send-welcome-email`, `batch-update-users`), dispatch goes
through an application port implemented by `bullmq-user-event-dispatcher.adapter.ts`.
A job runs in the tenant, correlation id and principal of the request that enqueued it:
the dispatcher stamps `withJobContext`, the processors use `@InJobContext()`
(`@nestjs-pipeline/job-context`), and `SessionJobPrincipal`
(`api/src/auths/infrastructure/session-job-principal.ts`) re-checks the principal when the
job runs. System work declares its principal and grants with `@AsSystem`. Failed commands and events are captured by `DeadLetterBehavior` into a `dead-letters`
queue. The Nest in-memory `EventBus` is **not** a transactional outbox; there is no durable
delivery guarantee.

### Multi-tenancy

`TenantSchemaMiddleware` sets the request's tenant through `TenantSchemaContext` (over
`@nestjs-pipeline/tenant`); the store, pipelines, cache keys and jobs read that one tenant.
Other code that needs it calls `requireTenant(purpose)` (`@cqrs-ddd/core/application`);
there is no tenant port. A missing tenant fails closed with `MissingTenantContextError`;
see Multi-tenant persistence.

### Authentication and authorization

Session cookie → `AuthSessionGuard` → `SessionPrincipalContextInterceptor` sets the
request principal. Login issues a short-lived access token and a rotating, hashed refresh
token (cookie only); the `Auth` aggregate is the session. CASL checks types in
`CaslBehavior` (`requires(...)`, rules from `CaslPermissionSource`) and entities and fields
in the handler (`CaslAuthorizer`). Details under Authentication and Authorization below.
<!-- context:manual-end architecture -->

## Critical Modules

<!-- context:manual-start critical-modules -->
*Manual section — the generator never overwrites it. Each module's details are in the
`CLAUDE.md` named in its heading; this is what must not break.*

### Pipeline engine — `packages/pipeline/src/` ([CLAUDE.md](../packages/pipeline/CLAUDE.md))

- Discovers CQRS handlers and wraps them: `[global before] → [@UsePipeline] → [global after]
  → handler`; a behavior declared globally and on a handler runs once, at its global
  position. Global guards stay outside short-circuiting behaviors.
- Keeps no tenant or correlation store: it takes both from `PipelineModule.forRoot({ sources })`
  (`tenantSource`, `correlationSource`; the api wires them in
  `api/src/common/context/context-sources.ts`) and runs the chain inside them.
- Imports NestJS CQRS internals (`@nestjs/cqrs/dist/services/explorer.service`): a Nest minor
  release can break discovery. Do not expand that coupling.

### Persistence lifecycle — `packages/ddd-core/`, `packages/ddd-mikro-orm/` ([core](../packages/ddd-core/CLAUDE.md), [MikroORM](../packages/ddd-mikro-orm/CLAUDE.md))

- Core owns the ORM-neutral contracts and lifecycle decorators; `@cqrs-ddd/mikro-orm` owns
  every MikroORM and database-specific piece, including `TenantStore`.
- `@PersistedWrite` (or `@Cache → @AcknowledgePersisted → @MapPersistenceErrors`) keeps the
  persisted version from advancing before a durable write; caches hold snapshots; conflicts
  surface as `ConcurrencyConflictError`. A DB commit and a cache change are not one
  transaction. Repair cache races inside the abstraction, with regression tests.

### Authorization — `packages/pipeline-casl/`, `api/src/{users,roles,auths}`

- `CaslBehavior` checks types; `CaslAuthorizer` checks entities and fields after the aggregate
  loads. A cache or idempotency hit skips the second check, so keys must partition tenant,
  principal and permission scope (`tenantSegments` in core for the tenant part).
- `user_permission_rules` is written only by `UserPermissionsProjector`; any other write to
  roles, capabilities or assignments must rebuild the affected users in the same
  transaction (`permissions:verify` finds drift).

### Authentication — `api/src/auths/` ([api CLAUDE.md](../api/CLAUDE.md))

- Only refresh-token hashes are stored; the token travels only in an `HttpOnly; Secure;
  SameSite=Strict; Path=/auths` cookie. The live-session lookup precedes the consumed-token
  lookup, and a rotation's consumed token is recorded before the version-conditioned save.
- A logged-out access token stays valid until `exp`; without `TRUST_PROXY` behind a load
  balancer every client shares one refresh rate-limit bucket.

### Multi-tenant persistence — `api/src/persistence/`

- One `MikroOrmStore` (libSQL: a database per tenant; PostgreSQL: a schema per tenant) over
  `TenantStore`; a tenant outside `persistenceConfig().tenants` is rejected. Tenant ownership
  of an EntityManager stays outside MikroORM objects. Real-ORM suite:
  `api/test/store-context.spec.ts`.
- Maintenance commands run through `api/src/persistence/cli.ts`. `Migration20260830000000`
  builds its SQL from the current schemas, so a schema edit changes what that applied
  migration creates.

### Wiring — `api/src/common/modules/`

- `ObservabilityModule` holds the global behavior list and its order, which wraps every
  handler; `ReliabilityModule` wires queues, dead letters, rate limits, idempotency,
  resilience, cache and feature flags.
- `AttributesBehavior` (`@nestjs-pipeline/opentelemetry`) must stay inside `TraceBehavior`
  and `MetricsBehavior` and outside the add-ons whose `build<Name>Attributes` factories it
  runs; `api/test/span-attributes.spec.ts` fails if the attributes stop reaching the span.
- Redis, database and OTLP settings come only from `redisConfig()`, `persistenceConfig()`
  and `otlpConfig()`.
<!-- context:manual-end critical-modules -->

## Dependencies and Integrations

<!-- context:generated-start dependencies -->
External dependency names and declared ranges only. No credential, endpoint or
environment value is read or reproduced here.

| Integration | Packages | Declared in |
| --- | --- | --- |
| NestJS runtime — Application framework and DI container | `@nestjs/common`, `@nestjs/core` | `api`, `packages/pipeline`, `packages/pipeline-audit`, `packages/pipeline-cache`, … (+10) |
| NestJS CQRS — Command/query/event buses wrapped by the pipeline | `@nestjs/cqrs` | `api`, `packages/pipeline` |
| MikroORM — ORM, unit of work, migrations | `@mikro-orm/core`, `@mikro-orm/migrations` | `api`, `packages/ddd-mikro-orm` |
| PostgreSQL — Relational backend and schema-per-tenant access | `pg`, `@mikro-orm/postgresql` | `api` |
| SQLite / libSQL — Local and test persistence backend | `@libsql/client`, `@mikro-orm/libsql` | `api` |
| Redis — Cache and queue backend | `@keyv/redis`, `redis` | `api`, `packages/pipeline-cache` |
| BullMQ — Background jobs and dead-letter transport | `bullmq`, `@nestjs/bullmq` | `api` |
| Keyv / cache-manager — Pluggable cache stores | `keyv`, `cache-manager` | `api`, `packages/pipeline-cache` |
| OpenTelemetry — Tracing and metrics | `@opentelemetry/api`, `@opentelemetry/sdk-node` | `api`, `packages/pipeline-opentelemetry` |
| OpenFeature — Feature-flag evaluation | `@openfeature/server-sdk` | `api`, `packages/pipeline-feature-flags` |
| CASL — Attribute/role based authorization | `@casl/ability` | `api`, `packages/pipeline-casl` |
| JOSE — JWT signing and verification | `jose` | `api` |
| Zod — Schema validation for DTOs and pipeline payloads | `zod` | `api`, `packages/pipeline-zod` |
| Pino — Structured logging | `nestjs-pino`, `pino-http`, `pino-pretty` | `api` |
| Fastify — Alternative HTTP adapter and sessions | `@nestjs/platform-fastify`, `@fastify/secure-session` | `api` |
| Express — Default HTTP adapter | `@nestjs/platform-express` | `api` |
| Cockatiel — Retry, timeout and circuit-breaker policies | `cockatiel` | `api`, `packages/pipeline-resilience` |
| rate-limiter-flexible — Rate-limit counters | `rate-limiter-flexible` | `api`, `packages/pipeline-rate-limit` |
| Vitest — Test runner | `vitest` | `api`, `packages/ddd-core`, `packages/ddd-mikro-orm`, `packages/pipeline`, … (+16) |
| Biome — Formatter, linter and Grit plugin host | `@biomejs/biome` | `api` |
| TypeScript — Language and type checker | `typescript` | `api`, `packages/ddd-core`, `packages/ddd-mikro-orm` |
| SWC — Decorator-aware test transform | `unplugin-swc` | `api` |

### Declared dependencies per workspace

| Workspace | Internal | External | Peers |
| --- | --- | --- | --- |
| `api` | 17 workspace packages | `@casl/ability`, `@fastify/secure-session`, `@keyv/redis`, `@libsql/client`, `@mikro-orm/core`, `@mikro-orm/libsql`, `@mikro-orm/migrations`, `@mikro-orm/postgresql`, `@mikro-orm/sql`, `@nestjs/bullmq`, … (+26) | — |
| `packages/ddd-core` | `@cqrs-ddd/safe-stringify`, `@cqrs-ddd/uuidv7` | — | — |
| `packages/ddd-mikro-orm` | — | — | `@cqrs-ddd/core`, `@mikro-orm/core` |
| `packages/pipeline` | `@cqrs-ddd/safe-stringify`, `@cqrs-ddd/untyped`, `@cqrs-ddd/uuidv7` | — | `@nestjs/common`, `@nestjs/core`, `@nestjs/cqrs`, `reflect-metadata`, `rxjs` |
| `packages/pipeline-audit` | `@cqrs-ddd/safe-stringify`, `@cqrs-ddd/uuidv7` | — | `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-cache` | `@cqrs-ddd/safe-stringify` | — | `@keyv/memcache`, `@keyv/postgres`, `@keyv/redis`, `@keyv/sqlite`, `@nestjs-pipeline/core`, `@nestjs/common`, `cache-manager`, `keyv`, `reflect-metadata` |
| `packages/pipeline-casl` | `@cqrs-ddd/safe-stringify` | — | `@casl/ability`, `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-correlation` | `@cqrs-ddd/untyped`, `@cqrs-ddd/uuidv7` | — | `@nestjs/common` |
| `packages/pipeline-deadletter` | `@cqrs-ddd/safe-stringify`, `@cqrs-ddd/uuidv7` | — | `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-feature-flags` | — | — | `@nestjs-pipeline/core`, `@nestjs/common`, `@openfeature/server-sdk`, `reflect-metadata` |
| `packages/pipeline-idempotency` | `@cqrs-ddd/safe-stringify`, `@cqrs-ddd/untyped` | — | `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-job-context` | — | — | `@nestjs/common` |
| `packages/pipeline-opentelemetry` | `@cqrs-ddd/untyped` | — | `@nestjs-pipeline/core`, `@nestjs/common`, `@opentelemetry/api`, `reflect-metadata` |
| `packages/pipeline-rate-limit` | `@cqrs-ddd/safe-stringify` | — | `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-resilience` | — | — | `@nestjs-pipeline/core`, `@nestjs/common`, `cockatiel`, `reflect-metadata` |
| `packages/pipeline-tenant` | — | — | — |
| `packages/pipeline-zod` | `@cqrs-ddd/untyped` | — | `@nestjs-pipeline/core`, `@nestjs/common`, `zod` |
| `packages/safe-stringify` | — | — | — |
| `packages/untyped` | — | — | — |
| `packages/uuidv7` | — | — | — |

### Environment variables referenced in source

Names only — values are never read by the generator.

`ACCESS_TOKEN_MAX_BYTES`, `ADAPTER`, `AMQP_URL`, `API_CLIENTS`, `AUTH_LOGIN_CODE`, `AUTH_LOGIN_CODE_SHA256`, `AUTH_SHARED_LOGIN_CODE`, `AUTH_TOKEN`, `DATABASE_HOST`, `DATABASE_NAME`, `DATABASE_PASSWORD`, `DATABASE_PORT`, `DATABASE_URL`, `DATABASE_USER`, `DB_DEFAULT_SCHEMA`, `DB_ENGINE`, `FLAGSMITH_KEY`, `JWT_ALGORITHMS`, `JWT_AUDIENCE`, `JWT_ISSUER`, `JWT_PUBLIC_KEY`, `JWT_PUBLIC_KEY_ALG`, `JWT_SECRET`, `NODE_ENV`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `PERMISSIONS_IN_ACCESS_TOKEN`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_URL`, `REGION`, `SESSION_SECRET`, `SQLITE_DATABASE_TEMPLATE`, `SQLITE_TENANTS`, `TESTCONTAINERS_RYUK_DISABLED`, `TRUST_PROXY`, `UNLEASH_TOKEN`
<!-- context:generated-end dependencies -->

## Conventions

<!-- context:manual-start conventions -->
*Manual section — the generator never overwrites it. Naming, comments and layering rules
live in `AGENTS.md`; this table keeps what is specific to this repository.*

| Area | Convention | Evidence |
| --- | --- | --- |
| Files | Kebab-case with a role suffix (`*.behavior.ts`, `*.handler.ts`, `*.command-repository.ts`, …); packages group source folders by role (`constants`, `helpers`, `interfaces`, `errors`, …) behind one index, such as `packages/pipeline/src/index.ts` | `AGENTS.md` → Naming, Directory Map |
| Imports | `@common/*`, `@persistence/*` aliases in `api`; `@cqrs-ddd/core` only through `/domain`, `/application`, `/persistence`, `/http`; `@cqrs-ddd/*` utilities imported directly, never re-exported | `biome/plugins/ddd-entry-points.grit`, `packages/CLAUDE.md` |
| Package independence | `@cqrs-ddd/*` import no NestJS or `@nestjs-pipeline/*`; `@nestjs-pipeline/tenant`, `/correlation`, `/job-context` import no other pipeline package; a package peers on core only if it imports it | `framework-independence.grit`, `packages/pipeline/src/package-boundaries.spec.ts` |
| Errors | Framework-neutral inward; HTTP mapping only at the boundary (`domainErrorHttpStatus()`) | `transport-neutral-errors.grit`, `api/src/common/filters/` |
| Configuration | `process.env` only in bootstrap and config code; one `<system>.config.ts` per external system (`redisConfig()`, `persistenceConfig()`, `otlpConfig()`), the only reader of its variables | `core-environment.grit`, `AGENTS.md` rule 23, `api/src/common/environment/` |
| Persistence | Handlers depend on repository tokens; aggregates change only through domain methods; field limits live in the aggregate's `rules` | `handler-boundaries.grit`, `aggregate-identity.grit`, `packages/ddd-core/domain/rules/` |
| Validation | Zod schemas on commands and queries plus `ZodPipe` | `packages/pipeline-zod` |
| Tooling | Biome (2 spaces, single quotes); strict `tsc --noEmit` per workspace; license header on every package `.ts` | `biome.json`, `tsconfig.base.json`, `package-licenses.grit` |
| Commits | Conventional style: `feat(scope): …`, `fix(scope): …`, `refactor: …` | `git log` |
<!-- context:manual-end conventions -->

## Commands

<!-- context:generated-start commands -->
Commands are read from manifests. The generator does not execute them; treat every
row as *declared* unless you have run it yourself in this checkout.

### Root scripts (`package.json`)

| Command | Script body |
| --- | --- |
| `pnpm build` | `pnpm -r build` |
| `pnpm check` | `biome check .` |
| `pnpm clean` | `pnpm -r run clean` |
| `pnpm clean:all` | `rm -rf node_modules .tmp .cache coverage api/node_modules api/dist api/…` |
| `pnpm context:check` | `python3 scripts/update-claude-snapshot.py --check` |
| `pnpm context:update` | `python3 scripts/update-claude-snapshot.py` |
| `pnpm context:validate` | `python3 scripts/validate-claude-context.py` |
| `pnpm copy-licenses` | `node -e "const fs=require('fs'),path=require('path'),dirs=fs.readdirSyn…` |
| `pnpm format` | `biome check --write .` |
| `pnpm lint` | `pnpm lint:persistence && pnpm -r lint` |
| `pnpm lint:persistence` | `biome lint --only=plugin .` |
| `pnpm publish:all` | `pnpm copy-licenses && pnpm -r publish --access public` |
| `pnpm rebuild` | `pnpm -r run clean && pnpm -r build` |
| `pnpm test` | `pnpm test:unit` |
| `pnpm test:all:full` | `(pnpm -r --no-bail --workspace-concurrency=1 run test --coverage --cove…` |
| `pnpm test:build` | `pnpm -r --no-bail build` |
| `pnpm test:coverage` | `pnpm -r --no-bail --workspace-concurrency=1 run test --coverage --cover…` |
| `pnpm test:e2e` | `pnpm --filter @nestjs-pipeline/ddd-api test:e2e` |
| `pnpm test:last:fails` | `node -e 'const fs=require("fs");if(!fs.existsSync("test-run.log")){cons…` |
| `pnpm test:last:log` | `less -R test-run.log` |
| `pnpm test:last:review` | `node -e 'const fs=require("fs");if(!fs.existsSync("test-run.log")){cons…` |
| `pnpm test:release` | `pnpm rebuild && pnpm copy-licenses && node integration/packages/release…` |
| `pnpm test:unit` | `pnpm lint:persistence && pnpm -r --no-bail test` |
| `pnpm verify:all` | `pnpm lint && pnpm test:unit && pnpm test:build && pnpm test:release && …` |

### Workspace scripts

Workspaces with the same scripts share a row.

| Workspaces | Scripts |
| --- | --- |
| `api` | `build`, `clean`, `db:migrate`, `db:revert`, `dev`, `lint`, `permissions:rebuild`, `permissions:verify`, `rebuild`, `sessions:purge`, `start`, `start:fastify`, `start:prod`, `start:prod:fastify`, … (+5) |
| `packages/ddd-core`, `packages/ddd-mikro-orm` | `build`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
| `packages/pipeline`, `packages/pipeline-audit`, `packages/pipeline-cache`, `packages/pipeline-casl`, `packages/pipeline-correlation`, `packages/pipeline-deadletter`, `packages/pipeline-feature-flags`, `packages/pipeline-idempotency`, `packages/pipeline-job-context`, `packages/pipeline-opentelemetry`, `packages/pipeline-rate-limit`, `packages/pipeline-resilience`, `packages/pipeline-tenant`, `packages/pipeline-zod`, `packages/safe-stringify`, `packages/untyped`, `packages/uuidv7` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |

### Context-management commands

| Command | Purpose |
| --- | --- |
| `pnpm context:update` | Regenerate this map (`scripts/update-claude-snapshot.py`). |
| `pnpm context:check` | Fail if the committed map is stale. |
| `pnpm context:validate` | Run all context checks (`scripts/validate-claude-context.py`). |
<!-- context:generated-end commands -->

## Testing Strategy

<!-- context:manual-start testing-strategy -->
*Manual section — the generator never overwrites it. Spec location, coverage and seam rules:
`packages/CLAUDE.md` and `api/CLAUDE.md`.*

- **Framework**: Vitest (`globals: true`); `api` transforms decorators with `unplugin-swc`.
  Packages require 100% coverage per file.
- **Suites**: `api/test/*.spec.ts` cross-module, `api/test/*.e2e-spec.ts` end to end (60 s
  timeout). PostgreSQL and Redis adapters are tested there against real services, except
  `RabbitMqDeadLetterTransport`; the default local path uses SQLite/libSQL and memory stores.
- **Architecture guards run as tests**: `package-boundaries.spec.ts`, the Biome plugin specs
  in `packages/ddd-core/persistence/`, `api/test/behavior-composition-contracts.spec.ts`.
- **Release**: `pnpm test:release` loads every package from its tarball (root entry points only).
- **Log helpers**: `test:all:full` writes `test-run.log`; its `tee` has no `pipefail`, so its
  exit status does not prove success.
- **Build first**: `api` resolves the workspace packages through their built `dist/`. Without
  `pnpm build`, most api test files and `pnpm lint` fail; after a package change, rebuild
  that package before running api tests (verified 2026-09-29).
- **Typecheck scope**: `api/tsconfig.json` (used by `lint` and `typecheck`) covers `api/src`
  and `api/test`; `api/tsconfig.build.json` compiles `api/src` only. Test imports use the
  real paths; there is no resolver that rewrites old ones.
- **Gaps**: no combined coverage total and no CI; every suite runs locally.
<!-- context:manual-end testing-strategy -->

## Security and Operational Notes

<!-- context:manual-start security-notes -->
*Manual section — the generator never overwrites it. Names and mechanisms only; never a
secret value.*

- **Authentication boundary**: global `AuthSessionGuard` plus `SessionPrincipalContextInterceptor`
  (`api/src/app.module.ts`). Access tokens are verified statelessly (no per-request
  session read); refresh tokens are opaque, hashed at rest, rotated on use and cookie-only.
  `PERMISSIONS_IN_ACCESS_TOKEN` (off by default) copies rules into the token: permission
  changes then apply at the next refresh and the rules become readable by the client.
- **Authorization boundary**: `CaslBehavior` at request/type level; `CaslAuthorizer` at
  entity and field level inside the handler. A cache or idempotency hit skips the second one
  — key accordingly. `CaslPermissionSource` reads database permissions by default; verified
  bearer grants bypass that read when token mode is enabled. Fastify session-cookie principals
  use database permissions. Write responses expose only what the caller may read afterwards.
- **Secret loading**: `api/src/common/environment/load-optional-env-file.ts` loads an optional
  `.env` before any environment-dependent import (`api/src/main.ts`). Values come from the
  process environment; nothing is committed. `.env*` files are gitignored and are never read
  into context files.
- **Jobs**: a queue payload is untrusted data. It carries only the principal's identity,
  never grants; `@InJobContext()` refuses a malformed context and `SessionJobPrincipal`
  re-checks the session, user or API client (`packages/pipeline-job-context/README.md`).
- **Rate limiting, retries, idempotency**: wired in
  `api/src/common/modules/reliability.module.ts` (429 via `RateLimitExceededFilter`, 409/422
  via `IdempotencyConflictFilter`).
- **Consistency**: no exactly-once delivery or cross-store transaction (see Persistence
  lifecycle failure modes; the in-memory `EventBus` is not an outbox).
- **Logging restrictions**: audit records redact payload fields
  (`packages/pipeline-audit/src/helpers/`); do not log credentials, tokens, or session
  contents. Correlation IDs are caller-supplied tracing metadata and must not be treated as
  identity.
- **Deployment** (`Needs verification`, no manifests here): Node ≥ 22, external PostgreSQL
  and Redis, an OTLP endpoint.
<!-- context:manual-end security-notes -->

## Important Gotchas

<!-- context:manual-start gotchas -->
*Manual section — the generator never overwrites it. Every entry cites a source.*

- **Global logging defaults live in `ObservabilityModule`.** users-api sets
  `requestResponseLogLevel: 'log'` globally; handler `logging({...})` entries carry only deltas
  such as `mapLogLevel` and shallow-merge over it (`api/src/common/modules/observability.module.ts`).
- **One reader per external system.** `DB_ENGINE`, the tenant lists and the database
  connection variables are read only by `persistenceConfig()`
  (`api/src/persistence/persistence.config.ts`); the application, `TenantSchemaMiddleware` and
  the maintenance CLI share its tenant list. Read them anywhere else and the served and
  migrated tenant sets can drift apart again. Redis settings come only from `redisConfig()`
  and the OTLP exporter's from `otlpConfig()` (`api/src/common/environment/`).
- **The aggregate property-write lint is naming-based only.** `biome/plugins/aggregate-identity.grit`
  matches receivers literally named `user`, `role`, `aggregate`, `entity`. Aliases, types,
  destructuring and dynamic keys are outside its coverage — domain-method mutation is still
  mandatory where the lint cannot see.
- **Send refresh and logout without an `Authorization` header.** An expired bearer token is
  rejected by the global guard before `/auths/refresh` runs (`api/src/common/guards/auth-session.guard.ts`).
- **Importing the Fastify platform module in an Express e2e run changes teardown timing.**
  Keep Express setup in `api/src/express-platform.ts`, separate from `http-platform.ts`.
- **Direct writes to assignment tables drift `user_permission_rules`.** Tests and tools
  that insert `user_roles`, `role_capabilities` or per-user grants must call
  `UserPermissionsProjector.rebuild` (e2e: `rebuildPermissions` in `api/test/support/e2e-app.ts`).
- **Root-array projection preserves arrays.** Named fields apply to each element; indexed
  masks are supported. A collection candidate does not authorize each entity independently
  (`packages/pipeline-casl/src/helpers/projection.ts`).
- **JWT verification requires `exp` and nonempty `sid`.** Legacy session cookies without a
  session id are rejected (`api/src/auths/services/jwt-authenticator.ts`,
  `request-principal-resolver.ts`).
- **Field projection inherits parent grants.** `CaslAuthorizer.project` returns
  `profile.secret` under a `fields: ['profile']` grant while `can(…, 'profile.secret')` is
  `false` (`packages/pipeline-casl/src/helpers/projection.ts`).
- **Repository caching and pipeline caching are separate layers with separate owners.**
  Entity invalidation does not invalidate a composed pipeline result. Do not move application
  composition into a repository to cache it (`packages/ddd-core/README.md`, `packages/pipeline-cache/README.md`).
- **`ddd-core` root barrel is off-limits in users-api production code.** Import
  `/domain`, `/application` or `/persistence` (`biome/plugins/ddd-entry-points.grit`).
- **`api/src/main.ts` must stay free of environment-dependent static imports.** ESM dependencies
  execute before the module body, so the env file is loaded first and `./bootstrap` is
  imported dynamically.
- **`api/src/tracing.ts` must be imported before NestJS.** `api/src/bootstrap.ts` imports it on its
  first line; reordering breaks instrumentation.
- **NestJS versions are pinned by root `overrides`** (`@nestjs/core`, `@nestjs/common`,
  `@nestjs/cqrs`). Changing a pin affects every package and the release verification.
- **Package `LICENSE` files are generated.** `pnpm copy-licenses` writes them into
  `packages/*` and they are gitignored; they exist only for tarball creation.
- **No CI runs these checks.** There is no `.github/` or other CI configuration
  (verified 2026-09-20), so `pnpm verify:all` is a local responsibility.
<!-- context:manual-end gotchas -->

## Snapshot Metadata

<!-- context:generated-start metadata -->
- Generated at: 2026-09-29T08:34:14Z
- Git commit: 8c9ff5264721e1b17ef08f92db256491de2ed143
- Git branch: develop
- Uncommitted changes when generated: yes
- Generator: `scripts/update-claude-snapshot.py` version 1.0.0
- Snapshot status: generated — structural inspection only, no code executed
- Files inspected: 922
- Included top-level directories: `.agents`, `.claude`, `api`, `biome`, `integration`, `packages`, `scripts`
- Excluded directory names: `.cache`, `.git`, `.gradle`, `.idea`, `.mypy_cache`, `.next`, `.nuxt`, `.parcel-cache`, `.pnpm-store`, `.pytest_cache`, `.ruff_cache`, `.svelte-kit`, `.terraform`, `.tmp`, `.tox`, `.turbo`, `.venv`, `.vscode`, `__pycache__`, `bower_components`, `build`, `coverage`, `dist`, `node_modules`, `out`, `target`, `vendor`, `venv`, `virtualenv`
- Excluded file patterns: `.env`, `.env.*`, `*.env`, `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*.jks`, `*.keystore`, `id_rsa*`, `id_ed25519*`, `*credentials*`, `*.secret`, `secrets.*`

The four volatile fields above (timestamp, commit, branch, dirty flag) are ignored by
`--check`, so routine commits do not mark the map stale; structural drift does.
<!-- context:generated-end metadata -->
