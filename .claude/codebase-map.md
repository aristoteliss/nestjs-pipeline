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

`ddd/` holds the Domain-Driven Design side: `ddd/core` provides reusable DDD primitives
(aggregate roots, domain events, command/query base classes, repository contracts, the
persistence lifecycle decorators), and `ddd/users-api` is a runnable multi-tenant reference
application that composes everything. The example is a demonstration, not the boundary of
what the libraries support.
<!-- context:manual-end purpose -->

## Repository Shape

<!-- context:generated-start repository-shape -->
- **Shape**: monorepo — workspace globs `ddd/*`, `packages/*` (14 workspace packages).
- **Publishable packages**: 12 (manifest without `private: true`).
- **Private workspaces**: 2.
- **Runnable workspaces**: 1 (`ddd/users-api`).

| Path | Package | Version | Publishable | Runnable |
| --- | --- | --- | --- | --- |
| `ddd/core` | `@nestjs-pipeline/ddd-core` | 0.0.3 | no | no |
| `ddd/users-api` | `@nestjs-pipeline/ddd-users-api` | 0.0.4 | no | yes |
| `packages/pipeline` | `@nestjs-pipeline/core` | 0.1.19 | yes | no |
| `packages/pipeline-audit` | `@nestjs-pipeline/audit` | 0.1.0 | yes | no |
| `packages/pipeline-cache` | `@nestjs-pipeline/cache` | 0.1.0 | yes | no |
| `packages/pipeline-casl` | `@nestjs-pipeline/casl` | 0.1.2 | yes | no |
| `packages/pipeline-correlation` | `@nestjs-pipeline/correlation` | 0.1.9 | yes | no |
| `packages/pipeline-deadletter` | `@nestjs-pipeline/deadletter` | 0.1.0 | yes | no |
| `packages/pipeline-feature-flags` | `@nestjs-pipeline/feature-flags` | 0.1.0 | yes | no |
| `packages/pipeline-idempotency` | `@nestjs-pipeline/idempotency` | 0.1.0 | yes | no |
| `packages/pipeline-opentelemetry` | `@nestjs-pipeline/opentelemetry` | 0.1.9 | yes | no |
| `packages/pipeline-rate-limit` | `@nestjs-pipeline/rate-limit` | 0.1.0 | yes | no |
| `packages/pipeline-resilience` | `@nestjs-pipeline/resilience` | 0.1.0 | yes | no |
| `packages/pipeline-zod` | `@nestjs-pipeline/zod` | 0.1.7 | yes | no |
<!-- context:generated-end repository-shape -->

## Technology Stack

<!-- context:generated-start technology-stack -->
- **Languages** (file counts, excluded directories omitted): `.ts` 606, `.md` 52, `.grit` 11, `.py` 3, `.mjs` 1, `.sql` 1
- **Runtime engines** (root `package.json`): `node` >=22.0.0, `pnpm` >=9.0.0
- **Package manager evidence**: `pnpm-lock.yaml`.

| Technology | Evidence (declared) | Used in (sample) |
| --- | --- | --- |
| NestJS runtime — Application framework and DI container | `@nestjs/common`, `@nestjs/core` | `ddd/core/persistence/biome-general-plugins.spec.ts`, `ddd/core/persistence/decorators/Cache.ts` |
| NestJS CQRS — Command/query/event buses wrapped by the pipeline | `@nestjs/cqrs` | `ddd/core/application/base.command.ts`, `ddd/core/application/command-base.handler.spec.ts` |
| MikroORM — ORM, unit of work, migrations | `@mikro-orm/core`, `@mikro-orm/nestjs`, `@mikro-orm/migrations` | `ddd/core/persistence/biome-general-plugins.spec.ts`, `ddd/core/persistence/optimistic-update.spec.ts` |
| PostgreSQL — Relational backend and schema-per-tenant access | `pg`, `@mikro-orm/postgresql` | `ddd/users-api/src/persistence/postgres-mikro-orm.store.ts`, `ddd/users-api/src/persistence/postgres-options.ts` |
| SQLite / libSQL — Local and test persistence backend | `@libsql/client`, `@mikro-orm/sqlite`, `@mikro-orm/libsql` | `ddd/users-api/src/persistence/libsql-options.ts`, `ddd/users-api/src/persistence/migrate.ts` |
| Redis — Cache and queue backend | `@keyv/redis`, `redis` | `packages/pipeline-idempotency/src/stores/redis.store.ts` |
| BullMQ — Background jobs and dead-letter transport | `bullmq`, `@nestjs/bullmq` | `ddd/users-api/src/infrastructure/reliability.module.ts`, `ddd/users-api/src/users/jobs/batch-update-users.processor.spec.ts` |
| Keyv / cache-manager — Pluggable cache stores | `keyv`, `cache-manager` | `ddd/users-api/test/behavior-composition-contracts.spec.ts`, `packages/pipeline-cache/src/adapters/cache-manager.adapter.ts` |
| OpenTelemetry — Tracing and metrics | `@opentelemetry/api`, `@opentelemetry/sdk-node` | `ddd/users-api/src/tracing.ts`, `ddd/users-api/test/behaviors.spec.ts` |
| OpenFeature — Feature-flag evaluation | `@openfeature/server-sdk` | `ddd/users-api/src/infrastructure/reliability.module.ts`, `ddd/users-api/test/behavior-composition-contracts.spec.ts` |
| CASL — Attribute/role based authorization | `@casl/ability` | `packages/pipeline-casl/src/capability.helpers.spec.ts`, `packages/pipeline-casl/src/casl.behavior.integration.spec.ts` |
| JOSE — JWT signing and verification | `jose` | `ddd/users-api/src/auths/infrastructure/authentication-adapters.spec.ts`, `ddd/users-api/src/auths/infrastructure/jose-access-token.issuer.ts` |
| Zod — Schema validation for DTOs and pipeline payloads | `zod` | `ddd/users-api/src/auths/cqrs/commands/create-auth.command.ts`, `ddd/users-api/src/auths/cqrs/commands/delete-auth.command.ts` |
| Pino — Structured logging | `nestjs-pino`, `pino-http`, `pino-pretty` | `ddd/users-api/src/bootstrap.ts`, `ddd/users-api/src/infrastructure/observability.module.spec.ts` |
| Fastify — Alternative HTTP adapter and sessions | `@nestjs/platform-fastify`, `@fastify/secure-session` | `ddd/users-api/src/auths/controllers/auths.controller.ts`, `ddd/users-api/src/auths/services/request-principal-resolver.spec.ts` |
| Express — Default HTTP adapter | `@nestjs/platform-express` | declared only |
| Cockatiel — Retry, timeout and circuit-breaker policies | `cockatiel` | `packages/pipeline-resilience/src/helpers/policy-factory.spec.ts`, `packages/pipeline-resilience/src/helpers/policy-factory.ts` |
| rate-limiter-flexible — Rate-limit counters | `rate-limiter-flexible` | `ddd/users-api/src/infrastructure/reliability.module.ts`, `ddd/users-api/test/behaviors.spec.ts` |
| Vitest — Test runner | `vitest` | `ddd/core/application/base.command.spec.ts`, `ddd/core/application/base.query.spec.ts` |
| Biome — Formatter, linter and Grit plugin host | `@biomejs/biome` | declared only |
| TypeScript — Language and type checker | `typescript` | declared only |
| SWC — Decorator-aware test transform | `unplugin-swc` | `ddd/users-api/vitest.config.e2e.ts`, `ddd/users-api/vitest.config.ts` |
<!-- context:generated-end technology-stack -->

## Entry Points

<!-- context:generated-start entry-points -->
| Path | Role | Invocation |
| --- | --- | --- |
| `ddd/core/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/ddd-core` |
| `ddd/users-api/src/bootstrap.ts` | Application bootstrap / composition | workspace `@nestjs-pipeline/ddd-users-api` |
| `ddd/users-api/src/main.ts` | Process entry point | workspace `@nestjs-pipeline/ddd-users-api` |
| `ddd/users-api/src/tracing.ts` | Telemetry initialization (loaded before the framework) | workspace `@nestjs-pipeline/ddd-users-api` |
| `integration/packages/release.mjs` | Referenced by a root script | `pnpm test:release` |
| `packages/pipeline-audit/src/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/audit` |
| `packages/pipeline-cache/src/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/cache` |
| `packages/pipeline-casl/src/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/casl` |
| `packages/pipeline-correlation/src/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/correlation` |
| `packages/pipeline-deadletter/src/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/deadletter` |
| `packages/pipeline-feature-flags/src/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/feature-flags` |
| `packages/pipeline-idempotency/src/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/idempotency` |
| `packages/pipeline-opentelemetry/src/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/opentelemetry` |
| `packages/pipeline-rate-limit/src/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/rate-limit` |
| `packages/pipeline-resilience/src/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/resilience` |
| `packages/pipeline-zod/src/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/zod` |
| `packages/pipeline/src/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/core` |
| `scripts/update-claude-snapshot.py` | Referenced by a root script | `pnpm context:check`; `pnpm context:update` |
| `scripts/validate-claude-context.py` | Referenced by a root script | `pnpm context:validate` |

Published packages additionally expose their built `main` (`dist/index.js`, produced by `pnpm build`), imported by package name.
<!-- context:generated-end entry-points -->

## Directory Map

<!-- context:generated-start directory-map -->
Only directories that carry responsibility are listed. Generated output, caches and
editor/tooling directories are excluded (see Snapshot Metadata).

| Directory | Responsibility | Key files |
| --- | --- | --- |
| `.agents/` | Guide architecture-sensitive implementation, reviews and documentation in nestjs-pipeline, preserving reusable library contracts and DDD boundaries. | subdirectories only |
| `.claude/` | Persistent, repository-local context for Claude Code and other coding agents. Everything here is plain Markdown plus two dependency-free Python scripts; nothing runs during a normal build or test. | `README.md`, `codebase-map.md` |
| `biome/` | Native Biome analyzer plugins registered in the root biome.json. They report diagnostics; they do not rewrite code automatically. (from `biome/plugins/README.md`) | subdirectories only |
| `ddd/` | Workspace container — 2 package(s); see the workspace table below | subdirectories only |
| `docs/` | External, non-code repository documentation. | `README.md` |
| `integration/` | Run pnpm test:release before publishing. It rebuilds the workspace, copies the licenses, and runs release.mjs. It is also part of pnpm verify:all. (from `integration/packages/README.md`) | subdirectories only |
| `packages/` | Workspace container — 12 package(s); see the workspace table below | `CLAUDE.md` |
| `scripts/` | Dependency-free Python utilities for the agent context-management system. They are not part of the build, the test run, or the release pipeline; see .claude/README.md for the full system description. | `README.md`, `claude-context-checkpoint.py`, `update-claude-snapshot.py`, `validate-claude-context.py` |

Root files: `.gitignore`, `.npmrc`, `AGENTS.md`, `CLAUDE.md`, `COMMERCIAL_LICENSE.txt`, `LICENSE`, `README.md`, `biome.json`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`

### Workspace packages

| Path | Package | Source layout | Docs |
| --- | --- | --- | --- |
| `ddd/core` | `@nestjs-pipeline/ddd-core` | `application`, `domain`, `persistence`, `types` | [README](ddd/core/README.md) |
| `ddd/users-api` | `@nestjs-pipeline/ddd-users-api` | `auths`, `common`, `infrastructure`, `persistence`, `roles`, `users` | [README](ddd/users-api/README.md) |
| `packages/pipeline` | `@nestjs-pipeline/core` | `behaviors`, `constants`, `decorators`, `helpers`, `interfaces`, `options`, `services`, `types` | [README](packages/pipeline/README.md) |
| `packages/pipeline-audit` | `@nestjs-pipeline/audit` | `constants`, `helpers`, `interfaces`, `sinks` | [README](packages/pipeline-audit/README.md) |
| `packages/pipeline-cache` | `@nestjs-pipeline/cache` | `adapters`, `constants`, `errors`, `helpers`, `interfaces` | [README](packages/pipeline-cache/README.md) |
| `packages/pipeline-casl` | `@nestjs-pipeline/casl` | `constants`, `exceptions`, `helpers`, `interfaces`, `providers`, `services`, `types` | [README](packages/pipeline-casl/README.md) |
| `packages/pipeline-correlation` | `@nestjs-pipeline/correlation` | `constants`, `decorators`, `helpers`, `middlewares`, `options`, `types` | [README](packages/pipeline-correlation/README.md) |
| `packages/pipeline-deadletter` | `@nestjs-pipeline/deadletter` | `constants`, `helpers`, `interfaces`, `transports` | [README](packages/pipeline-deadletter/README.md) |
| `packages/pipeline-feature-flags` | `@nestjs-pipeline/feature-flags` | `constants`, `errors`, `helpers`, `interfaces` | [README](packages/pipeline-feature-flags/README.md) |
| `packages/pipeline-idempotency` | `@nestjs-pipeline/idempotency` | `constants`, `errors`, `filters`, `helpers`, `interfaces`, `stores` | [README](packages/pipeline-idempotency/README.md) |
| `packages/pipeline-opentelemetry` | `@nestjs-pipeline/opentelemetry` | flat (no subdirectories) | [README](packages/pipeline-opentelemetry/README.md) |
| `packages/pipeline-rate-limit` | `@nestjs-pipeline/rate-limit` | `constants`, `errors`, `filters`, `helpers`, `interfaces` | [README](packages/pipeline-rate-limit/README.md) |
| `packages/pipeline-resilience` | `@nestjs-pipeline/resilience` | `constants`, `errors`, `helpers`, `interfaces` | [README](packages/pipeline-resilience/README.md) |
| `packages/pipeline-zod` | `@nestjs-pipeline/zod` | `errors`, `filters`, `helpers`, `pipes` | [README](packages/pipeline-zod/README.md) |
<!-- context:generated-end directory-map -->

## Architecture

<!-- context:manual-start architecture -->
*Manual section — the generator never overwrites it. Verify each claim against the source
path given before relying on it.*

### Layers

| Layer | Where | Depends on |
| --- | --- | --- |
| Presentation | `ddd/users-api/src/*/controllers`, `dtos`, `responses`, `mappers`, `ddd/users-api/src/common/filters`, `guards`, `interceptors` | Command/Query buses only |
| Application (CQRS) | `ddd/users-api/src/*/cqrs`, `src/*/application/ports` | Repository/port interfaces and injection tokens |
| Domain | `ddd/users-api/src/*/domain`, `ddd/core/domain` | Nothing framework-specific |
| Persistence | `ddd/users-api/src/persistence`, `src/*/persistence`, `ddd/core/persistence` | MikroORM, cache adapters |
| Pipeline / cross-cutting | `packages/*`, wired in `src/infrastructure/*.module.ts` | NestJS CQRS |

The direction is strictly inward: presentation → application → domain. Persistence
implements application-owned interfaces. Biome Grit plugins enforce the crossings
(`biome/plugins/ddd-layering.grit`, `handler-boundaries.grit`, `ddd-entry-points.grit`,
`transport-neutral-errors.grit`).

### Request flow

`HTTP request` → `HttpCorrelationMiddleware` + `TenantSchemaMiddleware`
(`ddd/users-api/src/app.module.ts` `configure()`) → `AuthSessionGuard` (global `APP_GUARD`) →
`SessionUserContextInterceptor` (global `APP_INTERCEPTOR`) → controller (`ZodPipe`
validation) → `CommandBus`/`QueryBus` → pipeline chain → handler.

Chain order: `[global before] → [@UsePipeline behaviors] → [global after] → handler`. A
behavior named both globally and on a handler runs **once, at its global position**, with
the handler's options (`packages/pipeline/src/services/pipeline.bootstrap.service.ts`;
README "Pipeline Execution Model"). Global behaviors are registered in
`ddd/users-api/src/infrastructure/observability.module.ts`.

### Persistence flow

Commands load aggregates through `IWriteSideAggregateRepository` →
`MikroOrmWriteSideCommandRepository` (`{ refresh: true }`, bypasses `@FromCache` and the
identity map) → domain method mutates the aggregate → `ICommandRepository.save()` →
`@Cache` → `@AcknowledgePersisted` → `@MapPersistenceErrors` → MikroORM. Updates are
version-conditioned (`ddd/core/persistence/optimistic-update.ts`), deletes are conditional
on `{ id, version }`. `CommandBaseHandler` publishes the aggregate's buffered events after
the handler returns.

Queries go through `IQueryRepository` with `@FromCache({ alwaysHydrate: true, hydrateFn })`
and return domain aggregates; entity/field authorization runs afterwards via
`CaslAuthorizer` in the handler.

### Errors

Domain and application code throw framework-neutral errors
(`ddd/core/domain/exceptions/`). `ddd/users-api/src/common/filters/domain-exception.filter.ts` maps them:
`ConcurrencyConflictError` → 409, `EntityNotFoundException` → 404, unique-constraint
exceptions → 409, invariant violations → 422, `InvalidLoginCredentialsException` → 401,
`AuthConfigurationException` → 500, otherwise 400. `ZodValidationFilter`,
`RateLimitExceededFilter`, `IdempotencyConflictFilter`, `FeatureDisabledFilter` and
`UnauthorizedActionFilter` are registered in `ddd/users-api/src/bootstrap.ts`.

### Background jobs

BullMQ over Redis, wired in `ddd/users-api/src/infrastructure/reliability.module.ts`. Processors live in
`ddd/users-api/src/users/jobs/` (`send-welcome-email`, `batch-update-users`), dispatch goes
through an application port implemented by `bullmq-user-event-dispatcher.adapter.ts`.
Failed commands and events are captured by `DeadLetterBehavior` into a `dead-letters`
queue. The Nest in-memory `EventBus` is **not** a transactional outbox; there is no durable
delivery guarantee.

### Multi-tenancy

`TenantSchemaMiddleware` resolves the tenant per request; `TenantSchemaContext` and
`EntityManagerTenantRegistry` (an external `WeakMap`) bind an EntityManager to a tenant
without mutating ORM objects. Missing tenant context fails closed with
`MissingTenantContextError` — never a shared `'default'` namespace.

### Authentication and authorization

Session cookie → `AuthSessionGuard` → `SessionUserContextInterceptor` populates the request
user context. JWT issuing/verification is behind ports
(`ddd/users-api/src/auths/infrastructure/jose-access-token.issuer.ts`, `ddd/users-api/src/auths/services/jwt-authenticator.ts`),
cookie lifecycle in `ddd/users-api/src/auths/services/session.service.ts`, domain login in
`user-login.service.ts`. CASL does type-level checks in `CaslBehavior` and entity/field
checks in the handler after the aggregate is loaded
(`ddd/users-api/src/users/persistence/casl-user-context.resolver.ts`, `roles/persistence/*capabilities*`).
<!-- context:manual-end architecture -->

## Critical Modules

<!-- context:manual-start critical-modules -->
*Manual section — the generator never overwrites it.*

### Pipeline engine — `packages/pipeline/src/`

- **Responsibility**: discover CQRS handlers and wrap them in the behavior chain;
  carry per-request state through `AsyncLocalStorage` (`pipeline.context.ts`).
- **Internal boundaries**: `packages/pipeline/src/services/pipeline-plan.ts` composes declarations and options;
  `packages/pipeline/src/services/pipeline-contracts.ts` validates contracts; `packages/pipeline/src/services/pipeline-runner.ts`
  executes the request-local chain. The bootstrap service owns Nest discovery, DI,
  prototype dispatch ownership, failed-bootstrap rollback and shutdown cleanup.
- **Dependencies**: `@nestjs/cqrs`, and NestJS CQRS internals
  (`@nestjs/cqrs/dist/services/explorer.service`) in `packages/pipeline/src/services/pipeline.bootstrap.service.ts`.
- **Invariants**: chain order `[global before] → [@UsePipeline] → [global after] → handler`;
  a duplicated behavior class runs once, at its global position; global security guards stay
  outside short-circuiting behaviors.
- **Failure modes**: a NestJS minor release changing CQRS internals breaks discovery;
  behavior mis-ordering silently moves an authorization boundary.
- **Do not change casually**: the private-API import, chain ordering, deduplication.
  Requires compatibility reasoning and tests for supported Nest majors.

### Persistence lifecycle and caching — `ddd/core/persistence/`

- **Responsibility**: repository contracts, `@Cache` / `@FromCache` / `@AcknowledgePersisted`
  / `@MapPersistenceErrors`, `optimisticUpdate`, `MemoryCache`, cache barrier/version helpers.
- **Invariants**: decorator order `@Cache → @AcknowledgePersisted → @MapPersistenceErrors`;
  the persisted version baseline advances only after a durable write; caches hold
  serializable snapshots, never live aggregates; version conflicts surface as
  `ConcurrencyConflictError`.
- **Failure modes**: stale fill overwriting newer cache state; delete/recreate and
  expiry/absence ABA resurrecting a deleted snapshot; retry exhaustion
  (`MAX_BARRIER_RETRIES = 2`); a DB commit and a cache mutation are **not** one transaction.
- **Do not change casually**: barrier installation/validation, CAS comparison
  (`isCacheNewer`), `disableIdentityMap` in `MikroOrmCache`, `optimisticUpdate`'s rejection
  of outer transactions. Repair races inside the abstraction, with regression tests.

### Authorization — `packages/pipeline-casl/`, `ddd/users-api/src/{users,roles,auths}`

- **Responsibility**: `CaslBehavior` for request/type-level rules; `CaslAuthorizer` for
  entity-level, field-level and response-field filtering after the aggregate is loaded.
- **Invariants**: a type-level check never substitutes for the entity decision; role
  capabilities come from persistence providers; principal resolution is explicit
  (`casl-user-context.resolver.ts`, `request-principal-resolver.ts`).
- **Failure modes**: a cache or idempotency hit skipping the handler's entity/field checks;
  a permission change that leaves principal-scoped entries valid.

### Cache and idempotency keying — `packages/pipeline-cache/`, `packages/pipeline-idempotency/`

- **Invariants**: a short-circuit key must include every security dimension that can change
  the authorized response (tenant, principal, permission scope, request identity). Correlation
  IDs are tracing metadata, never a principal boundary. An idempotency key is an operation
  identity, not a disposable response-cache key — rotating it on permission change can let
  the same effect run twice.
- **Failure modes**: tenant-only keys on principal-filtered responses; silent fallback to a
  shared namespace when tenant context is missing.

### Authentication — `ddd/users-api/src/auths/`

- **Responsibility**: credential verification, JWT issue/verify behind ports, session cookie
  lifecycle, API-client authentication, capability encoding.
- **Invariants**: `SessionService` owns cookies (presentation), `UserLoginService` owns
  domain login; `jose` stays behind `jose-access-token.issuer.ts`; Fastify mode refuses to
  boot without `SESSION_SECRET` (`ddd/users-api/src/bootstrap.ts`).

### Multi-tenant persistence — `ddd/users-api/src/persistence/`

- **Responsibility**: MikroORM stores (SQLite/libSQL and PostgreSQL), tenant schema context
  and middleware, tenant↔EntityManager registry, transient-error classification, migrations.
- **Invariants**: tenant ownership metadata stays external to MikroORM objects
  (`entity-manager-tenant.registry.ts`); contextual EntityManager reuse validates
  driver/config/schema plus registry tenant.
- **Do not change casually**: applied migrations, the write-side authoritative load path.

### Observability and reliability wiring — `ddd/users-api/src/infrastructure/`

- **Responsibility**: `ObservabilityModule` (Pino, OTel trace/metrics, audit, global behavior
  chain) and `ReliabilityModule` (BullMQ, dead-letter, rate limit, idempotency, resilience,
  cache, feature flags).
- **Do not change casually**: the global behavior list and its order — it defines what every
  handler in the application is wrapped with.
<!-- context:manual-end critical-modules -->

## Dependencies and Integrations

<!-- context:generated-start dependencies -->
External dependency names and declared ranges only. No credential, endpoint or
environment value is read or reproduced here.

| Integration | Declared in | Imported by (sample) |
| --- | --- | --- |
| NestJS runtime | `ddd/core`, `ddd/users-api`, `packages/pipeline`, `packages/pipeline-audit`, … (+10) | `ddd/core/persistence/biome-general-plugins.spec.ts`, `ddd/core/persistence/decorators/Cache.ts` |
| NestJS CQRS | `ddd/core`, `ddd/users-api`, `packages/pipeline` | `ddd/core/application/base.command.ts`, `ddd/core/application/command-base.handler.spec.ts` |
| MikroORM | `ddd/core`, `ddd/users-api` | `ddd/core/persistence/biome-general-plugins.spec.ts`, `ddd/core/persistence/optimistic-update.spec.ts` |
| PostgreSQL | `ddd/users-api` | `ddd/users-api/src/persistence/postgres-mikro-orm.store.ts`, `ddd/users-api/src/persistence/postgres-options.ts` |
| SQLite / libSQL | `ddd/users-api` | `ddd/users-api/src/persistence/libsql-options.ts`, `ddd/users-api/src/persistence/migrate.ts` |
| Redis | `ddd/users-api`, `packages/pipeline-cache` | `packages/pipeline-idempotency/src/stores/redis.store.ts` |
| BullMQ | `ddd/users-api` | `ddd/users-api/src/infrastructure/reliability.module.ts`, `ddd/users-api/src/users/jobs/batch-update-users.processor.spec.ts` |
| Keyv / cache-manager | `ddd/users-api`, `packages/pipeline-cache` | `ddd/users-api/test/behavior-composition-contracts.spec.ts`, `packages/pipeline-cache/src/adapters/cache-manager.adapter.ts` |
| OpenTelemetry | `ddd/users-api`, `packages/pipeline-opentelemetry` | `ddd/users-api/src/tracing.ts`, `ddd/users-api/test/behaviors.spec.ts` |
| OpenFeature | `ddd/users-api`, `packages/pipeline-feature-flags` | `ddd/users-api/src/infrastructure/reliability.module.ts`, `ddd/users-api/test/behavior-composition-contracts.spec.ts` |
| CASL | `ddd/users-api`, `packages/pipeline-casl` | `packages/pipeline-casl/src/capability.helpers.spec.ts`, `packages/pipeline-casl/src/casl.behavior.integration.spec.ts` |
| JOSE | `ddd/users-api` | `ddd/users-api/src/auths/infrastructure/authentication-adapters.spec.ts`, `ddd/users-api/src/auths/infrastructure/jose-access-token.issuer.ts` |
| Zod | `ddd/users-api`, `packages/pipeline-zod` | `ddd/users-api/src/auths/cqrs/commands/create-auth.command.ts`, `ddd/users-api/src/auths/cqrs/commands/delete-auth.command.ts` |
| Pino | `ddd/users-api` | `ddd/users-api/src/bootstrap.ts`, `ddd/users-api/src/infrastructure/observability.module.spec.ts` |
| Fastify | `ddd/users-api` | `ddd/users-api/src/auths/controllers/auths.controller.ts`, `ddd/users-api/src/auths/services/request-principal-resolver.spec.ts` |
| Express | `ddd/users-api` | not imported directly |
| Cockatiel | `ddd/users-api`, `packages/pipeline-resilience` | `packages/pipeline-resilience/src/helpers/policy-factory.spec.ts`, `packages/pipeline-resilience/src/helpers/policy-factory.ts` |
| rate-limiter-flexible | `ddd/users-api`, `packages/pipeline-rate-limit` | `ddd/users-api/src/infrastructure/reliability.module.ts`, `ddd/users-api/test/behaviors.spec.ts` |
| Vitest | `ddd/core`, `ddd/users-api`, `packages/pipeline`, `packages/pipeline-audit`, … (+10) | `ddd/core/application/base.command.spec.ts`, `ddd/core/application/base.query.spec.ts` |
| Biome | `ddd/core`, `ddd/users-api` | not imported directly |
| TypeScript | `ddd/core`, `ddd/users-api` | not imported directly |
| SWC | `ddd/users-api` | `ddd/users-api/vitest.config.e2e.ts`, `ddd/users-api/vitest.config.ts` |

### Declared dependencies per workspace

| Workspace | Internal | External | Peers |
| --- | --- | --- | --- |
| `ddd/core` | `@nestjs-pipeline/core`, `@nestjs-pipeline/correlation` | `@nestjs/common`, `@nestjs/cqrs` | `@mikro-orm/core` |
| `ddd/users-api` | 13 workspace packages | `@casl/ability`, `@fastify/secure-session`, `@keyv/redis`, `@libsql/client`, `@mikro-orm/core`, `@mikro-orm/libsql`, `@mikro-orm/migrations`, `@mikro-orm/nestjs`, `@mikro-orm/postgresql`, `@mikro-orm/sqlite`, … (+26) | — |
| `packages/pipeline` | — | — | `@nestjs/common`, `@nestjs/core`, `@nestjs/cqrs`, `reflect-metadata`, `rxjs` |
| `packages/pipeline-audit` | — | — | `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-cache` | — | — | `@keyv/memcache`, `@keyv/postgres`, `@keyv/redis`, `@keyv/sqlite`, `@nestjs-pipeline/core`, `@nestjs/common`, `cache-manager`, `keyv`, `reflect-metadata` |
| `packages/pipeline-casl` | — | — | `@casl/ability`, `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-correlation` | — | — | `@nestjs-pipeline/core`, `@nestjs/common` |
| `packages/pipeline-deadletter` | — | — | `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-feature-flags` | — | — | `@nestjs-pipeline/core`, `@nestjs/common`, `@openfeature/server-sdk`, `reflect-metadata` |
| `packages/pipeline-idempotency` | — | — | `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-opentelemetry` | — | — | `@nestjs-pipeline/core`, `@nestjs/common`, `@opentelemetry/api`, `reflect-metadata` |
| `packages/pipeline-rate-limit` | — | — | `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-resilience` | — | — | `@nestjs-pipeline/core`, `@nestjs/common`, `cockatiel`, `reflect-metadata` |
| `packages/pipeline-zod` | — | — | `@nestjs-pipeline/core`, `@nestjs/common`, `zod` |

### Environment variables referenced in source

Names only — values are never read by the generator.

`ADAPTER`, `AMQP_URL`, `API_CLIENTS`, `AUTH_LOGIN_CODE`, `AUTH_LOGIN_CODE_SHA256`, `AUTH_TOKEN`, `DATABASE_HOST`, `DATABASE_NAME`, `DATABASE_PASSWORD`, `DATABASE_PORT`, `DATABASE_URL`, `DATABASE_USER`, `DB_DEFAULT_SCHEMA`, `DB_ENGINE`, `FLAGSMITH_KEY`, `JWT_ALGORITHMS`, `JWT_AUDIENCE`, `JWT_ISSUER`, `JWT_PUBLIC_KEY`, `JWT_PUBLIC_KEY_ALG`, `JWT_SECRET`, `NODE_ENV`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_URL`, `REGION`, `SEED_TENANT`, `SESSION_SECRET`, `SQLITE_DATABASE_TEMPLATE`, `SQLITE_TENANTS`, `TENANT_SCHEMAS`, `TESTCONTAINERS_RYUK_DISABLED`, `UNLEASH_TOKEN`
<!-- context:generated-end dependencies -->

## Conventions

<!-- context:manual-start conventions -->
*Manual section — the generator never overwrites it. Each row cites its evidence.*

| Area | Convention | Evidence |
| --- | --- | --- |
| Naming | `<concern>.behavior.ts`, `<concern>.module.ts`, `*.command.ts`, `*.query.ts`, `*.handler.ts`, `*.entity.ts`, `*.exception.ts` / `*.error.ts`, `*.command-repository.ts`, `*.query-repository.ts`, `*.spec.ts` | existing files under `packages/*/src`, `ddd/users-api/src` |
| File organization | Packages: `src/{constants,helpers,interfaces,errors,filters,...}` + one `packages/*/src/index.ts`. App: feature folder with `controllers/ cqrs/ domain/ dtos/ mappers/ persistence/` | `.claude/codebase-map.md` → Directory Map |
| Imports | Path aliases `@common/*`, `@persistence/*` in users-api; `ddd-core` imported via `/domain`, `/application`, `/persistence`, never the root barrel | `ddd/users-api/vitest.config.ts`, `biome/plugins/ddd-entry-points.grit` |
| Error handling | Framework-neutral errors inward, HTTP mapping at the presentation boundary only | `biome/plugins/transport-neutral-errors.grit`, `ddd/users-api/src/common/filters/` |
| Logging | Structured Pino; cross-cutting logging via `LoggingBehavior`, not manual calls in handlers | `ddd/users-api/src/infrastructure/observability.module.ts` |
| Configuration | `process.env` only in bootstrap/infrastructure/config; application code takes ports and module options | `biome/plugins/core-environment.grit`, `ddd/users-api/src/common/environment/` |
| Database access | Handlers depend on repository interfaces and tokens; ORM only in persistence adapters | `biome/plugins/handler-boundaries.grit` |
| Validation | Zod schemas on commands/queries plus `ZodPipe` at the controller | `packages/pipeline-zod`, `src/*/cqrs/commands/*.command.ts` |
| Aggregate mutation | Factories and domain methods only; public setters exist solely for MikroORM hydration and are `@internal`/`@deprecated` | `biome/plugins/aggregate-identity.grit`, `ddd/core/domain/models/aggregate-root.ts` |
| Formatting | Biome, 2-space indent, single quotes | `biome.json` |
| Type checking | `tsc --noEmit` per workspace, strict + `noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns` | `tsconfig.base.json`, package `lint` scripts |
| Licensing | Every `packages/**/*.ts` starts with the repository copyright header | `biome/plugins/package-licenses.grit` |
| Comments | No banners, no narrative signposting, no ticket/review identifiers, no history-telling; short step markers in multi-phase core logic are welcome | `AGENTS.md` → Documentation and comment policy |
| Commit messages | Conventional style observed: `feat(scope): …`, `fix(scope): …`, `docs: …` | `git log` |
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
| `pnpm context:check` | `python3 scripts/update-claude-snapshot.py --check` |
| `pnpm context:update` | `python3 scripts/update-claude-snapshot.py` |
| `pnpm context:validate` | `python3 scripts/validate-claude-context.py` |
| `pnpm copy-licenses` | `node -e "const fs=require('fs'),path=require('path'),dirs=fs.readdirSync('packages').filter(d=>fs.existsSync(…` |
| `pnpm format` | `biome check --write .` |
| `pnpm lint` | `pnpm lint:persistence && pnpm -r lint` |
| `pnpm lint:persistence` | `biome lint --only=plugin .` |
| `pnpm publish:all` | `pnpm copy-licenses && pnpm -r publish --access public` |
| `pnpm rebuild` | `pnpm -r run clean && pnpm -r build` |
| `pnpm test` | `pnpm test:unit` |
| `pnpm test:build` | `pnpm -r --no-bail build` |
| `pnpm test:coverage` | `pnpm -r --no-bail --workspace-concurrency=1 run test --coverage --coverage.reporter=text-summary --coverage.r…` |
| `pnpm test:e2e` | `pnpm --filter @nestjs-pipeline/ddd-users-api test:e2e` |
| `pnpm test:release` | `pnpm rebuild && pnpm copy-licenses && node integration/packages/release.mjs` |
| `pnpm test:unit` | `pnpm lint:persistence && pnpm -r --no-bail test` |
| `pnpm verify:all` | `pnpm lint && pnpm test:unit && pnpm test:build && pnpm test:release && pnpm test:e2e` |

### Workspace scripts

| Workspace | Scripts |
| --- | --- |
| `ddd/core` | `build`, `clean`, `lint`, `rebuild`, `test`, `test:watch` |
| `ddd/users-api` | `build`, `clean`, `db:migrate`, `db:revert`, `dev`, `lint`, `rebuild`, `start`, `start:fastify`, `start:prod`, `start:prod:fastify`, `test`, `test:e2e`, `test:e2e:watch`, … (+2) |
| `packages/pipeline` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
| `packages/pipeline-audit` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
| `packages/pipeline-cache` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
| `packages/pipeline-casl` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
| `packages/pipeline-correlation` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
| `packages/pipeline-deadletter` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
| `packages/pipeline-feature-flags` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
| `packages/pipeline-idempotency` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
| `packages/pipeline-opentelemetry` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
| `packages/pipeline-rate-limit` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
| `packages/pipeline-resilience` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
| `packages/pipeline-zod` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test` |

### Context-management commands

| Command | Purpose |
| --- | --- |
| `pnpm context:update` | Regenerate this map (`scripts/update-claude-snapshot.py`). |
| `pnpm context:check` | Fail if the committed map is stale. |
| `pnpm context:validate` | Run all context checks (`scripts/validate-claude-context.py`). |
<!-- context:generated-end commands -->

## Testing Strategy

<!-- context:manual-start testing-strategy -->
*Manual section — the generator never overwrites it.*

- **Framework**: Vitest with `globals: true`; users-api transforms decorators through
  `unplugin-swc` (`ddd/users-api/vitest.config.ts`).
- **Locations**: `packages/*/src/**/*.spec.ts` and `ddd/core/**/*.spec.ts` beside the code;
  `ddd/users-api/src/**/*.spec.ts` for unit/adapter specs; `ddd/users-api/test/*.spec.ts`
  for cross-module suites; `ddd/users-api/test/*.e2e-spec.ts` for end-to-end
  (`vitest.config.e2e.ts`, 60s timeout).
- **Naming**: `describe`/`it` state the domain behavior or invariant. Ticket and review
  identifiers are forbidden in test names and file names (`biome/plugins/test-suite.grit`).
- **Mocks and seams**: mock at the module boundary (`vi.mock('@nestjs/cqrs', …)`). No
  production export, parameter, option, branch, or retained state may exist only so a test
  can reach it.
- **Integration dependencies**: a published package must not depend on `@nestjs/testing` —
  tests needing a Nest application live in `ddd/users-api`. Suites that need PostgreSQL or
  Redis are in `ddd/users-api/test/` (for example `postgres-migrations.e2e-spec.ts`,
  `bullmq-deadletter.e2e-spec.ts`); the default local path uses SQLite/libSQL and in-memory
  stores.
- **Environment**: copy `ddd/users-api/.env.example` to `.env` for local runs. Vitest sets
  `reflect-metadata` as a setup file.
- **Architecture guards run as tests**: `packages/pipeline/src/package-boundaries.spec.ts`,
  `ddd/core/persistence/biome-*-plugins.spec.ts`,
  `ddd/users-api/test/behavior-composition-contracts.spec.ts`,
  `cqrs-discovery-without-private-metadata.e2e-spec.ts`.
- **Release verification**: `pnpm test:release` packs every publishable package and loads it
  from its tarball in an isolated consumer (`integration/packages/README.md`). It checks root
  entry points only — not every subpath or dependency version.
- **Known gaps** (`Observed, not exhaustively verified`): no combined monorepo coverage
  total (`pnpm test:coverage` reports per workspace); no CI configuration in the repository,
  so all suites are run locally.
<!-- context:manual-end testing-strategy -->

## Security and Operational Notes

<!-- context:manual-start security-notes -->
*Manual section — the generator never overwrites it. Names and mechanisms only; never a
secret value.*

- **Authentication boundary**: global `AuthSessionGuard` plus `SessionUserContextInterceptor`
  (`ddd/users-api/src/app.module.ts`). Session cookies are issued and cleared only by `SessionService`.
- **Authorization boundary**: `CaslBehavior` at request/type level; `CaslAuthorizer` at
  entity and field level inside the handler. A cache or idempotency hit skips the second one
  — key accordingly.
- **Secret loading**: `ddd/users-api/src/common/environment/load-optional-env-file.ts` loads an optional
  `.env` before any environment-dependent import (`ddd/users-api/src/main.ts`). Values come from the
  process environment; nothing is committed. `.env*` files are gitignored and are never read
  into context files.
- **Fail-closed behavior**: Fastify mode requires `SESSION_SECRET`; missing tenant context
  raises `MissingTenantContextError`.
- **Rate limiting**: `RateLimitBehavior` over `rate-limiter-flexible`, memory-backed by
  default and Redis-backed in production (`ddd/users-api/src/infrastructure/reliability.module.ts`).
  Exceeded limits become HTTP 429 with `Retry-After` via `RateLimitExceededFilter`.
- **Retries and idempotency**: `ResilienceBehavior` (cockatiel retry/timeout/circuit breaker)
  and `IdempotencyBehavior` (claim + replay of successful responses). Conflicts map to
  HTTP 409/422 through `IdempotencyConflictFilter`.
- **Consistency**: a database commit and a cache mutation are separate boundaries.
  Stale reads and failed invalidations are possible; nothing here promises exactly-once
  delivery or strong cross-store consistency. The in-memory `EventBus` is not an outbox.
- **Logging restrictions**: audit records redact payload fields
  (`packages/pipeline-audit/src/helpers/`); do not log credentials, tokens, or session
  contents. Correlation IDs are caller-supplied tracing metadata and must not be treated as
  identity.
- **Deployment assumptions** (`Needs verification` — no deployment manifests in the
  repository): Node ≥ 22, pnpm ≥ 9, an external PostgreSQL and Redis for production
  profiles, an OTLP endpoint for traces. No Dockerfile, compose file, or CI configuration
  exists here.
- **Environment variable names** are listed in the generated Dependencies section; values
  are never recorded.
<!-- context:manual-end security-notes -->

## Important Gotchas

<!-- context:manual-start gotchas -->
*Manual section — the generator never overwrites it. Every entry cites a source.*

- **Private NestJS API in the bootstrap path.** `packages/pipeline/src/services/pipeline.bootstrap.service.ts`
  imports `@nestjs/cqrs/dist/services/explorer.service`. Accepted trade-off; a NestJS CQRS
  minor release can break handler discovery. Do not expand it or cite it as precedent.
- **Decorator order is load-bearing.** `@Cache → @AcknowledgePersisted → @MapPersistenceErrors`
  on `save()`. Inverting it acknowledges persistence before the write is durable.
  `pnpm lint:persistence` (`biome/plugins/persistence-lifecycle.grit`) fails on it.
- **`optimisticUpdate` rejects outer transactions.** `em.isInTransaction()` makes it throw,
  because acknowledgment and cache eviction must happen at commit time
  (`ddd/core/persistence/optimistic-update.ts`).
- **The aggregate setter lint is naming-based only.** `biome/plugins/aggregate-identity.grit`
  matches receivers literally named `user`, `role`, `aggregate`, `entity`. Aliases, types,
  destructuring and dynamic keys are outside its coverage — domain-method mutation is still
  mandatory where the lint cannot see.
- **A pipeline cache hit skips the handler's entity and field checks.** An outer type-level
  CASL check does not reproduce them (`AGENTS.md` rule 5; `packages/pipeline-cache`).
- **Repository caching and pipeline caching are separate layers with separate owners.**
  Entity invalidation does not invalidate a composed pipeline result. Do not move application
  composition into a repository to cache it (`ddd/core/README.md`, `packages/pipeline-cache/README.md`).
- **`ddd/users-api` is an example, not the contract boundary.** A missing call site there does
  not prove a published export is unused (`AGENTS.md` → Library scope).
- **`ddd-core` root barrel is off-limits in users-api production code.** Import
  `/domain`, `/application` or `/persistence` (`biome/plugins/ddd-entry-points.grit`).
- **Tenant metadata must stay off ORM objects.** Use `EntityManagerTenantRegistry`, never a
  `__tenant` property on a MikroORM EntityManager (`ddd/users-api/src/persistence/README.md`).
- **`ddd/users-api/src/main.ts` must stay free of environment-dependent static imports.** ESM dependencies
  execute before the module body, so the env file is loaded first and `./bootstrap` is
  imported dynamically.
- **`ddd/users-api/src/tracing.ts` must be imported before NestJS.** `ddd/users-api/src/bootstrap.ts` imports it on its
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
- Generated at: 2026-09-20T13:22:19Z
- Git commit: dc6b1499133e3d312220139a0f779a9064b09536
- Git branch: review/remaining-findings
- Uncommitted changes when generated: yes
- Generator: `scripts/update-claude-snapshot.py` version 1.0.0
- Snapshot status: generated — structural inspection only, no code executed
- Files inspected: 731
- Included top-level directories: `.agents`, `.claude`, `biome`, `ddd`, `docs`, `integration`, `packages`, `scripts`
- Excluded directory names: `.cache`, `.git`, `.gradle`, `.idea`, `.mypy_cache`, `.next`, `.nuxt`, `.parcel-cache`, `.pnpm-store`, `.pytest_cache`, `.ruff_cache`, `.svelte-kit`, `.terraform`, `.tmp`, `.tox`, `.turbo`, `.venv`, `.vscode`, `__pycache__`, `bower_components`, `build`, `coverage`, `dist`, `node_modules`, `out`, `target`, `vendor`, `venv`, `virtualenv`
- Excluded file patterns: `.env`, `.env.*`, `*.env`, `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*.jks`, `*.keystore`, `id_rsa*`, `id_ed25519*`, `*credentials*`, `*.secret`, `secrets.*`

The four volatile fields above (timestamp, commit, branch, dirty flag) are ignored by
`--check`, so routine commits do not mark the map stale; structural drift does.
<!-- context:generated-end metadata -->
