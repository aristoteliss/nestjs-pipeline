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
- **Shape**: monorepo — workspace globs `api`, `packages/*` (17 workspace packages).
- **Publishable packages**: 16 (manifest without `private: true`).
- **Private workspaces**: 1.
- **Runnable workspaces**: 1 (`api`).

| Path | Package | Version | Publishable | Runnable |
| --- | --- | --- | --- | --- |
| `api` | `@nestjs-pipeline/ddd-api` | 0.2.0 | no | yes |
| `packages/ddd-core` | `@cqrs-ddd/core` | 0.2.0 | yes | no |
| `packages/pipeline` | `@nestjs-pipeline/core` | 0.2.0 | yes | no |
| `packages/pipeline-audit` | `@nestjs-pipeline/audit` | 0.2.0 | yes | no |
| `packages/pipeline-cache` | `@nestjs-pipeline/cache` | 0.2.0 | yes | no |
| `packages/pipeline-casl` | `@nestjs-pipeline/casl` | 0.2.0 | yes | no |
| `packages/pipeline-correlation` | `@nestjs-pipeline/correlation` | 0.2.0 | yes | no |
| `packages/pipeline-deadletter` | `@nestjs-pipeline/deadletter` | 0.2.0 | yes | no |
| `packages/pipeline-feature-flags` | `@nestjs-pipeline/feature-flags` | 0.2.0 | yes | no |
| `packages/pipeline-idempotency` | `@nestjs-pipeline/idempotency` | 0.2.0 | yes | no |
| `packages/pipeline-opentelemetry` | `@nestjs-pipeline/opentelemetry` | 0.2.0 | yes | no |
| `packages/pipeline-rate-limit` | `@nestjs-pipeline/rate-limit` | 0.2.0 | yes | no |
| `packages/pipeline-resilience` | `@nestjs-pipeline/resilience` | 0.2.0 | yes | no |
| `packages/pipeline-tenant` | `@nestjs-pipeline/tenant` | 0.2.0 | yes | no |
| `packages/pipeline-zod` | `@nestjs-pipeline/zod` | 0.2.0 | yes | no |
| `packages/safe-stringify` | `@cqrs-ddd/safe-stringify` | 0.2.0 | yes | no |
| `packages/uuidv7` | `@cqrs-ddd/uuidv7` | 0.2.0 | yes | no |
<!-- context:generated-end repository-shape -->

## Technology Stack

<!-- context:generated-start technology-stack -->
- **Languages** (file counts, excluded directories omitted): `.ts` 704, `.md` 48, `.grit` 13, `.py` 3, `.mjs` 1
- **Runtime engines** (root `package.json`): `node` >=22.0.0, `pnpm` >=9.0.0
- **Package manager evidence**: `pnpm-lock.yaml`.

| Technology | Evidence (declared) | Used in (sample) |
| --- | --- | --- |
| NestJS runtime — Application framework and DI container | `@nestjs/common`, `@nestjs/core` | `api/src/app.module.ts`, `api/src/auths/authorization.module.ts` |
| NestJS CQRS — Command/query/event buses wrapped by the pipeline | `@nestjs/cqrs` | `api/src/app.module.ts`, `api/src/auths/controllers/auths.controller.ts` |
| MikroORM — ORM, unit of work, migrations | `@mikro-orm/core`, `@mikro-orm/nestjs`, `@mikro-orm/migrations` | `api/src/auths/persistence/user-permissions.projector.ts`, `api/src/persistence/libsql-options.ts` |
| PostgreSQL — Relational backend and schema-per-tenant access | `pg`, `@mikro-orm/postgresql` | `api/src/persistence/postgres-mikro-orm.store.ts`, `api/src/persistence/postgres-options.ts` |
| SQLite / libSQL — Local and test persistence backend | `@libsql/client`, `@mikro-orm/sqlite`, `@mikro-orm/libsql` | `api/src/persistence/libsql-options.ts`, `api/src/persistence/mikro-orm.store.ts` |
| Redis — Cache and queue backend | `@keyv/redis`, `redis` | `packages/pipeline-idempotency/src/stores/redis.store.ts` |
| BullMQ — Background jobs and dead-letter transport | `bullmq`, `@nestjs/bullmq` | `api/src/infrastructure/reliability.module.ts`, `api/src/users/jobs/batch-update-users.processor.spec.ts` |
| Keyv / cache-manager — Pluggable cache stores | `keyv`, `cache-manager` | `api/test/behavior-composition-contracts.spec.ts`, `packages/pipeline-cache/src/adapters/cache-manager.adapter.ts` |
| OpenTelemetry — Tracing and metrics | `@opentelemetry/api`, `@opentelemetry/sdk-node` | `api/src/tracing.ts`, `api/test/behaviors.spec.ts` |
| OpenFeature — Feature-flag evaluation | `@openfeature/server-sdk` | `api/src/infrastructure/reliability.module.ts`, `api/test/behavior-composition-contracts.spec.ts` |
| CASL — Attribute/role based authorization | `@casl/ability` | `api/src/common/constants/casl.constants.ts`, `api/test/user-permission-rules.spec.ts` |
| JOSE — JWT signing and verification | `jose` | `api/src/auths/infrastructure/authentication-adapters.spec.ts`, `api/src/auths/infrastructure/jose-access-token.issuer.ts` |
| Zod — Schema validation for DTOs and pipeline payloads | `zod` | `api/src/auths/cqrs/commands/create-auth.command.ts`, `api/src/auths/cqrs/commands/delete-auth.command.ts` |
| Pino — Structured logging | `nestjs-pino`, `pino-http`, `pino-pretty` | `api/src/bootstrap.ts`, `api/src/infrastructure/observability.module.spec.ts` |
| Fastify — Alternative HTTP adapter and sessions | `@nestjs/platform-fastify`, `@fastify/secure-session` | `api/src/auths/controllers/auths.controller.ts`, `api/src/auths/services/request-principal-resolver.spec.ts` |
| Express — Default HTTP adapter | `@nestjs/platform-express` | `api/src/bootstrap.ts`, `api/src/express-platform.ts` |
| Cockatiel — Retry, timeout and circuit-breaker policies | `cockatiel` | `packages/pipeline-resilience/src/helpers/policy-factory.spec.ts`, `packages/pipeline-resilience/src/helpers/policy-factory.ts` |
| rate-limiter-flexible — Rate-limit counters | `rate-limiter-flexible` | `api/src/infrastructure/reliability.module.ts`, `api/test/behaviors.spec.ts` |
| Vitest — Test runner | `vitest` | `api/src/auths/controllers/auths.controller.spec.ts`, `api/src/auths/cqrs/commands/create-auth-redaction.spec.ts` |
| Biome — Formatter, linter and Grit plugin host | `@biomejs/biome` | declared only |
| TypeScript — Language and type checker | `typescript` | declared only |
| SWC — Decorator-aware test transform | `unplugin-swc` | `api/vitest.config.e2e.ts`, `api/vitest.config.ts` |
<!-- context:generated-end technology-stack -->

## Entry Points

<!-- context:generated-start entry-points -->
| Path | Role | Invocation |
| --- | --- | --- |
| `api/src/bootstrap.ts` | Application bootstrap / composition | workspace `@nestjs-pipeline/ddd-api` |
| `api/src/main.ts` | Process entry point | workspace `@nestjs-pipeline/ddd-api` |
| `api/src/tracing.ts` | Telemetry initialization (loaded before the framework) | workspace `@nestjs-pipeline/ddd-api` |
| `integration/packages/release.mjs` | Referenced by a root script | `pnpm test:release` |
| `packages/ddd-core/index.ts` | Package public entry (barrel) | workspace `@cqrs-ddd/core` |
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
| `packages/pipeline-tenant/src/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/tenant` |
| `packages/pipeline-zod/src/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/zod` |
| `packages/pipeline/src/index.ts` | Package public entry (barrel) | workspace `@nestjs-pipeline/core` |
| `packages/safe-stringify/src/index.ts` | Package public entry (barrel) | workspace `@cqrs-ddd/safe-stringify` |
| `packages/uuidv7/src/index.ts` | Package public entry (barrel) | workspace `@cqrs-ddd/uuidv7` |
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
| `api/` | Sample NestJS app demonstrating @nestjs-pipeline/core usage | `CLAUDE.md`, `README.md`, `package.json`, `tsconfig.build.json` |
| `biome/` | Native Biome analyzer plugins registered in the root biome.json. They report diagnostics; they do not rewrite code automatically. (from `biome/plugins/README.md`) | subdirectories only |
| `integration/` | Run pnpm test:release before publishing. It rebuilds the workspace, copies the licenses, and runs release.mjs. It is also part of pnpm verify:all. (from `integration/packages/README.md`) | subdirectories only |
| `packages/` | Workspace container — 16 package(s); see the workspace table below | `CLAUDE.md` |
| `scripts/` | Dependency-free Python utilities for the agent context-management system. They are not part of the build, the test run, or the release pipeline; see .claude/README.md for the full system description. | `README.md`, `claude-context-checkpoint.py`, `update-claude-snapshot.py`, `validate-claude-context.py` |

Root files: `.gitignore`, `.npmrc`, `AGENTS.md`, `CLAUDE.md`, `COMMERCIAL_LICENSE.txt`, `LICENSE`, `README.md`, `biome.json`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`

### Workspace packages

| Path | Package | Source layout | Docs |
| --- | --- | --- | --- |
| `api` | `@nestjs-pipeline/ddd-api` | `auths`, `common`, `infrastructure`, `persistence`, `roles`, `users` | [README](api/README.md) |
| `packages/ddd-core` | `@cqrs-ddd/core` | `application`, `domain`, `http`, `persistence`, `types` | [README](packages/ddd-core/README.md) |
| `packages/pipeline` | `@nestjs-pipeline/core` | `behaviors`, `constants`, `decorators`, `errors`, `helpers`, `interfaces`, `options`, `services`, `types` | [README](packages/pipeline/README.md) |
| `packages/pipeline-audit` | `@nestjs-pipeline/audit` | `constants`, `helpers`, `interfaces`, `sinks` | [README](packages/pipeline-audit/README.md) |
| `packages/pipeline-cache` | `@nestjs-pipeline/cache` | `adapters`, `constants`, `errors`, `helpers`, `interfaces` | [README](packages/pipeline-cache/README.md) |
| `packages/pipeline-casl` | `@nestjs-pipeline/casl` | `constants`, `errors`, `filters`, `helpers`, `interfaces`, `types` | [README](packages/pipeline-casl/README.md) |
| `packages/pipeline-correlation` | `@nestjs-pipeline/correlation` | `constants`, `decorators`, `helpers`, `middlewares`, `options`, `types` | [README](packages/pipeline-correlation/README.md) |
| `packages/pipeline-deadletter` | `@nestjs-pipeline/deadletter` | `constants`, `helpers`, `interfaces`, `transports` | [README](packages/pipeline-deadletter/README.md) |
| `packages/pipeline-feature-flags` | `@nestjs-pipeline/feature-flags` | `constants`, `errors`, `filters`, `helpers`, `interfaces` | [README](packages/pipeline-feature-flags/README.md) |
| `packages/pipeline-idempotency` | `@nestjs-pipeline/idempotency` | `constants`, `errors`, `filters`, `helpers`, `interfaces`, `stores` | [README](packages/pipeline-idempotency/README.md) |
| `packages/pipeline-opentelemetry` | `@nestjs-pipeline/opentelemetry` | `helpers` | [README](packages/pipeline-opentelemetry/README.md) |
| `packages/pipeline-rate-limit` | `@nestjs-pipeline/rate-limit` | `constants`, `errors`, `filters`, `helpers`, `interfaces` | [README](packages/pipeline-rate-limit/README.md) |
| `packages/pipeline-resilience` | `@nestjs-pipeline/resilience` | `constants`, `errors`, `helpers`, `interfaces` | [README](packages/pipeline-resilience/README.md) |
| `packages/pipeline-tenant` | `@nestjs-pipeline/tenant` | flat (no subdirectories) | [README](packages/pipeline-tenant/README.md) |
| `packages/pipeline-zod` | `@nestjs-pipeline/zod` | `errors`, `filters`, `helpers`, `pipes` | [README](packages/pipeline-zod/README.md) |
| `packages/safe-stringify` | `@cqrs-ddd/safe-stringify` | flat (no subdirectories) | [README](packages/safe-stringify/README.md) |
| `packages/uuidv7` | `@cqrs-ddd/uuidv7` | flat (no subdirectories) | [README](packages/uuidv7/README.md) |
<!-- context:generated-end directory-map -->

## Architecture

<!-- context:manual-start architecture -->
*Manual section — the generator never overwrites it. Verify each claim against the source
path given before relying on it.*

### Layers

| Layer | Where | Depends on |
| --- | --- | --- |
| Presentation | `api/src/*/controllers`, `dtos`, `responses`, `mappers`, `api/src/common/filters`, `guards`, `interceptors` | Command/Query buses only |
| Application (CQRS) | `api/src/*/cqrs`, `src/*/application/ports` | Repository/port interfaces and injection tokens |
| Domain | `api/src/*/domain`, `packages/ddd-core/domain` | Nothing framework-specific |
| Persistence | `api/src/persistence`, `src/*/persistence`, `packages/ddd-core/persistence` | MikroORM, cache adapters |
| Pipeline / cross-cutting | `packages/*`, wired in `src/infrastructure/*.module.ts` | NestJS CQRS |

The direction is strictly inward: presentation → application → domain. Persistence
implements application-owned interfaces. Biome Grit plugins enforce the crossings
(`biome/plugins/ddd-layering.grit`, `handler-boundaries.grit`, `ddd-entry-points.grit`,
`transport-neutral-errors.grit`). `packages/ddd-core` depends on no NestJS or `@nestjs-pipeline/*`
package; users-api supplies the Nest glue (`framework-independence.grit`,
`packages/ddd-core/package-manifest.spec.ts`).

### Request flow

`HTTP request` → `HttpCorrelationMiddleware` + `TenantSchemaMiddleware`
(`api/src/app.module.ts` `configure()`) → `AuthSessionGuard` (global `APP_GUARD`) →
`SessionUserContextInterceptor` (global `APP_INTERCEPTOR`) → controller (`ZodPipe`
validation) → `CommandBus`/`QueryBus` → pipeline chain → handler.

Chain order: `[global before] → [@UsePipeline behaviors] → [global after] → handler`. A
behavior named both globally and on a handler runs **once, at its global position**, with
the handler's options (`packages/pipeline/src/services/pipeline.bootstrap.service.ts`;
README "Pipeline Execution Model"). Global behaviors are registered in
`api/src/infrastructure/observability.module.ts`.

### Persistence flow

Commands load aggregates through `IWriteSideAggregateRepository` →
`MikroOrmWriteSideCommandRepository` (`packages/ddd-core/persistence/`; `{ refresh: true }`, bypasses
`@FromCache` and the identity map) → domain method uses `applyPatch(...)` and returns `this`; `@ApplyMutation` advances the lifecycle and records events → `ICommandRepository.save()` →
`@PersistedWrite` (= `@Cache` → `@AcknowledgePersisted` → `@MapPersistenceErrors`) → MikroORM. Updates are
version-conditioned (`packages/ddd-core/persistence/optimistic-update.ts`), deletes are conditional
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

BullMQ over Redis, wired in `api/src/infrastructure/reliability.module.ts`. Processors live in
`api/src/users/jobs/` (`send-welcome-email`, `batch-update-users`), dispatch goes
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
(`api/src/auths/infrastructure/jose-access-token.issuer.ts`, `api/src/auths/services/jwt-authenticator.ts`),
cookie lifecycle in `api/src/auths/services/session.service.ts`, domain login in
`user-login.service.ts`. Login issues a short-lived stateless access token and a rotating,
hashed refresh token delivered only as the `refresh_token` cookie (`/auths/login|refresh|logout`,
`api/src/auths/cqrs/commands/refresh-auth.handler.ts`); the `Auth` aggregate is the session. CASL does type-level checks in `CaslBehavior` (declared with
`requires(...)`), fed per request by `CaslPermissionSource`
(`api/src/auths/persistence/casl-permission.source.ts`, bound via `AuthorizationModule`),
and entity/field checks in the handler after the aggregate is loaded (`CaslAuthorizer`:
`authorize` before writes, `project` for read models; writes answer through a fresh read).
<!-- context:manual-end architecture -->

## Critical Modules

<!-- context:manual-start critical-modules -->
*Manual section — the generator never overwrites it.*

### Pipeline engine — `packages/pipeline/src/`

- **Responsibility**: discover CQRS handlers and wrap them in the behavior chain;
  carry per-request state through `AsyncLocalStorage` (`pipeline.context.ts`).
- **Typed context items**: `pipeline-items.ts` adds symbol-backed tokens and accessors
  over the unchanged raw map. Required reads reject missing or undefined values;
  token types do not validate raw writes or establish authorization.
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

### Persistence lifecycle and caching — `packages/ddd-core/persistence/`

- **Responsibility**: repository contracts, `@Cache` / `@FromCache` / `@AcknowledgePersisted`
  / `@MapPersistenceErrors` / `@PersistedWrite`, `optimisticUpdate` / `optimisticDelete`,
  `MemoryCache` and `MikroOrmCache` (with `CacheEntry` and `createCacheTableSql`), cache
  barrier/version helpers, `MikroOrmWriteSideCommandRepository`, persistence error
  translation (`mapPersistenceError`, `isTransientPersistenceError`), and the root-entity
  schema mapping (`rootEntityProperties`, `versionProperty`). HTTP statuses for
  `packages/ddd-core` errors come from `packages/ddd-core/http/` (`domainErrorHttpStatus`).
- **Invariants**: `@PersistedWrite`, or decorator order `@Cache → @AcknowledgePersisted → @MapPersistenceErrors`;
  the persisted version baseline advances only after a durable write; caches hold
  serializable snapshots, never live aggregates; version conflicts surface as
  `ConcurrencyConflictError`.
- **Failure modes**: stale fill overwriting newer cache state; delete/recreate and
  expiry/absence ABA resurrecting a deleted snapshot; fill retry exhaustion; an
  unversioned adapter, which `@FromCache` bypasses entirely; a DB commit and a cache
  mutation are **not** one transaction.
- **Do not change casually**: barrier installation/validation, CAS comparison
  (`isCacheNewer`), `disableIdentityMap` in `MikroOrmCache`, `optimisticUpdate`'s rejection
  of outer transactions. Repair races inside the abstraction, with regression tests.

### Authorization — `packages/pipeline-casl/`, `api/src/{users,roles,auths}`

- **Responsibility**: `CaslBehavior` for request/type-level rules, loading the caller through
  the `ICaslPermissionSource` port; `CaslAuthorizer` (`can`, void `authorize`, `project`) for
  entity-level, field-level and response-field filtering after the aggregate is loaded.
- **Invariants**: a type-level check never substitutes for the entity decision; every deny
  rule is applied after every allow (`buildAbility`); user rules come from persistence by
  default or verified bearer-token grants in opt-in token mode; service rules come from
  `API_CLIENTS` configuration; principal classification is
  explicit (`casl-permission.source.ts`, `request-principal-resolver.ts`); reads whose rules
  have conditions bypass the repository cache (`read-freshness.helper.ts`).
- **Materialized permissions**: `user_permission_rules` is written only by
  `UserPermissionsProjector` (`api/src/auths/persistence/user-permissions.projector.ts`) and
  read through `UserPermissionRulesReader` by the permission source or token issuer; deletes
  cascade, any other write to role,
  capability or assignment rows must rebuild the affected users in the same transaction.
  `permissions:verify` detects drift, `permissions:rebuild` repairs it.
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

### Authentication — `api/src/auths/`

- **Responsibility**: credential verification, access-token issue/verify behind ports,
  refresh-token sessions (rotation, grace window, reuse revocation), session and refresh
  cookie lifecycle, API-client authentication (config `rules` parsed at startup into `grants`).
- **Invariants**: only refresh-token SHA-256 hashes are stored; the refresh token travels
  only as an `HttpOnly; Secure; SameSite=Strict; Path=/auths` cookie; the live-session lookup
  precedes the rotated-token history lookup; session saves are version-conditioned and a lost
  race in the live-token evaluation is re-evaluated once (grace); reuse revocation and logout retry version conflicts with authoritative reloads
  and propagate retry exhaustion through `AuthSessionRevocationService.revoke`. `SessionService` owns the Fastify session cookie,
  `api/src/auths/controllers/refresh-cookie.ts` the refresh cookie; `jose` stays behind
  `jose-access-token.issuer.ts`; token settings are parsed at boot
  (`api/src/common/environment/auth-token.config.ts`); Fastify refuses to boot without
  `SESSION_SECRET`.
- **Failure modes**: a logged-out access token stays valid until `exp`; without
  `TRUST_PROXY` behind a load balancer every client shares one refresh rate-limit bucket.

### Multi-tenant persistence — `api/src/persistence/`

- **Responsibility**: MikroORM stores (SQLite/libSQL and PostgreSQL), tenant schema context
  and middleware, tenant↔EntityManager registry, migrations. Transient-error
  classification comes from `packages/ddd-core/persistence`.
- **Invariants**: tenant ownership metadata stays external to MikroORM objects
  (`entity-manager-tenant.registry.ts`); contextual EntityManager reuse validates
  driver/config/schema plus registry tenant in one place for both drivers
  (`api/src/persistence/tenant-entity-manager.resolver.ts`, shared suite `api/test/store-context.spec.ts`).
- **Do not change casually**: applied migrations, the write-side authoritative load path.

### Observability and reliability wiring — `api/src/infrastructure/`

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
| NestJS runtime | `api`, `packages/pipeline`, `packages/pipeline-audit`, `packages/pipeline-cache`, … (+10) | `api/src/app.module.ts`, `api/src/auths/authorization.module.ts` |
| NestJS CQRS | `api`, `packages/pipeline` | `api/src/app.module.ts`, `api/src/auths/controllers/auths.controller.ts` |
| MikroORM | `api`, `packages/ddd-core`, `packages/pipeline-tenant` | `api/src/auths/persistence/user-permissions.projector.ts`, `api/src/persistence/libsql-options.ts` |
| PostgreSQL | `api` | `api/src/persistence/postgres-mikro-orm.store.ts`, `api/src/persistence/postgres-options.ts` |
| SQLite / libSQL | `api` | `api/src/persistence/libsql-options.ts`, `api/src/persistence/mikro-orm.store.ts` |
| Redis | `api`, `packages/pipeline-cache` | `packages/pipeline-idempotency/src/stores/redis.store.ts` |
| BullMQ | `api` | `api/src/infrastructure/reliability.module.ts`, `api/src/users/jobs/batch-update-users.processor.spec.ts` |
| Keyv / cache-manager | `api`, `packages/pipeline-cache` | `api/test/behavior-composition-contracts.spec.ts`, `packages/pipeline-cache/src/adapters/cache-manager.adapter.ts` |
| OpenTelemetry | `api`, `packages/pipeline-opentelemetry` | `api/src/tracing.ts`, `api/test/behaviors.spec.ts` |
| OpenFeature | `api`, `packages/pipeline-feature-flags` | `api/src/infrastructure/reliability.module.ts`, `api/test/behavior-composition-contracts.spec.ts` |
| CASL | `api`, `packages/pipeline-casl` | `api/src/common/constants/casl.constants.ts`, `api/test/user-permission-rules.spec.ts` |
| JOSE | `api` | `api/src/auths/infrastructure/authentication-adapters.spec.ts`, `api/src/auths/infrastructure/jose-access-token.issuer.ts` |
| Zod | `api`, `packages/pipeline-zod` | `api/src/auths/cqrs/commands/create-auth.command.ts`, `api/src/auths/cqrs/commands/delete-auth.command.ts` |
| Pino | `api` | `api/src/bootstrap.ts`, `api/src/infrastructure/observability.module.spec.ts` |
| Fastify | `api` | `api/src/auths/controllers/auths.controller.ts`, `api/src/auths/services/request-principal-resolver.spec.ts` |
| Express | `api` | `api/src/bootstrap.ts`, `api/src/express-platform.ts` |
| Cockatiel | `api`, `packages/pipeline-resilience` | `packages/pipeline-resilience/src/helpers/policy-factory.spec.ts`, `packages/pipeline-resilience/src/helpers/policy-factory.ts` |
| rate-limiter-flexible | `api`, `packages/pipeline-rate-limit` | `api/src/infrastructure/reliability.module.ts`, `api/test/behaviors.spec.ts` |
| Vitest | `api`, `packages/ddd-core`, `packages/pipeline`, `packages/pipeline-audit`, … (+13) | `api/src/auths/controllers/auths.controller.spec.ts`, `api/src/auths/cqrs/commands/create-auth-redaction.spec.ts` |
| Biome | `api`, `packages/ddd-core` | not imported directly |
| TypeScript | `api`, `packages/ddd-core` | not imported directly |
| SWC | `api` | `api/vitest.config.e2e.ts`, `api/vitest.config.ts` |

### Declared dependencies per workspace

| Workspace | Internal | External | Peers |
| --- | --- | --- | --- |
| `api` | 15 workspace packages | `@casl/ability`, `@fastify/secure-session`, `@keyv/redis`, `@libsql/client`, `@mikro-orm/core`, `@mikro-orm/libsql`, `@mikro-orm/migrations`, `@mikro-orm/nestjs`, `@mikro-orm/postgresql`, `@mikro-orm/sqlite`, … (+27) | — |
| `packages/ddd-core` | `@cqrs-ddd/safe-stringify`, `@cqrs-ddd/uuidv7` | — | `@mikro-orm/core` |
| `packages/pipeline` | `@cqrs-ddd/safe-stringify`, `@cqrs-ddd/uuidv7` | — | `@nestjs/common`, `@nestjs/core`, `@nestjs/cqrs`, `reflect-metadata`, `rxjs` |
| `packages/pipeline-audit` | `@cqrs-ddd/safe-stringify` | — | `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-cache` | `@cqrs-ddd/safe-stringify` | — | `@keyv/memcache`, `@keyv/postgres`, `@keyv/redis`, `@keyv/sqlite`, `@nestjs-pipeline/core`, `@nestjs/common`, `cache-manager`, `keyv`, `reflect-metadata` |
| `packages/pipeline-casl` | — | — | `@casl/ability`, `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-correlation` | `@cqrs-ddd/uuidv7` | — | `@nestjs-pipeline/core`, `@nestjs/common` |
| `packages/pipeline-deadletter` | `@cqrs-ddd/safe-stringify` | — | `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-feature-flags` | — | — | `@nestjs-pipeline/core`, `@nestjs/common`, `@openfeature/server-sdk`, `reflect-metadata` |
| `packages/pipeline-idempotency` | `@cqrs-ddd/safe-stringify` | — | `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-opentelemetry` | — | — | `@nestjs-pipeline/core`, `@nestjs/common`, `@opentelemetry/api`, `reflect-metadata` |
| `packages/pipeline-rate-limit` | `@cqrs-ddd/safe-stringify` | — | `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-resilience` | — | — | `@nestjs-pipeline/core`, `@nestjs/common`, `cockatiel`, `reflect-metadata` |
| `packages/pipeline-tenant` | — | — | `@cqrs-ddd/core`, `@nestjs-pipeline/core`, `@nestjs/common`, `reflect-metadata` |
| `packages/pipeline-zod` | — | — | `@nestjs-pipeline/core`, `@nestjs/common`, `zod` |
| `packages/safe-stringify` | — | — | — |
| `packages/uuidv7` | — | — | — |

### Environment variables referenced in source

Names only — values are never read by the generator.

`ACCESS_TOKEN_MAX_BYTES`, `ADAPTER`, `AMQP_URL`, `API_CLIENTS`, `AUTH_LOGIN_CODE`, `AUTH_LOGIN_CODE_SHA256`, `AUTH_SHARED_LOGIN_CODE`, `AUTH_TOKEN`, `DATABASE_HOST`, `DATABASE_NAME`, `DATABASE_PASSWORD`, `DATABASE_PORT`, `DATABASE_URL`, `DATABASE_USER`, `DB_DEFAULT_SCHEMA`, `DB_ENGINE`, `FLAGSMITH_KEY`, `JWT_ALGORITHMS`, `JWT_AUDIENCE`, `JWT_ISSUER`, `JWT_PUBLIC_KEY`, `JWT_PUBLIC_KEY_ALG`, `JWT_SECRET`, `NODE_ENV`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `PERMISSIONS_IN_ACCESS_TOKEN`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_URL`, `REGION`, `SEED_TENANT`, `SESSION_SECRET`, `SQLITE_DATABASE_TEMPLATE`, `SQLITE_TENANTS`, `TENANT_SCHEMAS`, `TESTCONTAINERS_RYUK_DISABLED`, `TRUST_PROXY`, `UNLEASH_TOKEN`
<!-- context:generated-end dependencies -->

## Conventions

<!-- context:manual-start conventions -->
*Manual section — the generator never overwrites it. Each row cites its evidence.*

| Area | Convention | Evidence |
| --- | --- | --- |
| Naming | `<concern>.behavior.ts`, `<concern>.module.ts`, `*.command.ts`, `*.query.ts`, `*.handler.ts`, `*.entity.ts`, `*.exception.ts` / `*.error.ts`, `*.command-repository.ts`, `*.query-repository.ts`, `*.spec.ts` | existing files under `packages/*/src`, `api/src` |
| File organization | Packages: `src/{constants,helpers,interfaces,errors,filters,...}` + one `packages/*/src/index.ts`. App: feature folder with `controllers/ cqrs/ domain/ dtos/ mappers/ persistence/` | `.claude/codebase-map.md` → Directory Map |
| Imports | Path aliases `@common/*`, `@persistence/*` in users-api; `ddd-core` imported via `/domain`, `/application`, `/persistence`, `/http`, never the root barrel | `api/vitest.config.ts`, `biome/plugins/ddd-entry-points.grit` |
| Framework independence | `packages/ddd-core`, `packages/uuidv7` and `packages/safe-stringify` import no NestJS, `nestjs`-named or `@nestjs-pipeline/*` package, specs included, and declare none; `packages/ddd-core` depends only on the two `@cqrs-ddd/*` utilities; Nest glue lives in the application | `biome/plugins/framework-independence.grit`, `packages/ddd-core/package-manifest.spec.ts`, `packages/ddd-core/domain/domain-entry-point.spec.ts` |
| Error handling | Framework-neutral errors inward, HTTP mapping at the presentation boundary only; statuses for `packages/ddd-core` errors come from `domainErrorHttpStatus()` | `biome/plugins/transport-neutral-errors.grit`, `packages/ddd-core/http/`, `api/src/common/filters/` |
| Logging | Structured Pino; cross-cutting logging via `LoggingBehavior`, not manual calls in handlers | `api/src/infrastructure/observability.module.ts` |
| Configuration | `process.env` only in bootstrap/infrastructure/config; application code takes ports and module options | `biome/plugins/core-environment.grit`, `api/src/common/environment/` |
| Database access | Handlers depend on repository interfaces and tokens; ORM only in persistence adapters | `biome/plugins/handler-boundaries.grit` |
| Validation | Zod schemas on commands/queries plus `ZodPipe` at the controller | `packages/pipeline-zod`, `src/*/cqrs/commands/*.command.ts` |
| Aggregate mutation | Factories and domain methods only; public setters exist solely for MikroORM hydration and are `@internal`/`@deprecated` | `biome/plugins/aggregate-identity.grit`, `packages/ddd-core/domain/models/aggregate-root.ts` |
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
| `pnpm test:all:full` | `(pnpm -r --no-bail --workspace-concurrency=1 run test --coverage --coverage.reporter=text-summary --coverage.…` |
| `pnpm test:build` | `pnpm -r --no-bail build` |
| `pnpm test:coverage` | `pnpm -r --no-bail --workspace-concurrency=1 run test --coverage --coverage.reporter=text-summary --coverage.r…` |
| `pnpm test:e2e` | `pnpm --filter @nestjs-pipeline/ddd-api test:e2e` |
| `pnpm test:last:fails` | `node -e 'const fs=require("fs");if(!fs.existsSync("test-run.log")){console.log("No test-run.log found. Run pn…` |
| `pnpm test:last:log` | `less -R test-run.log` |
| `pnpm test:last:review` | `node -e 'const fs=require("fs");if(!fs.existsSync("test-run.log")){console.log("No test-run.log found. Run pn…` |
| `pnpm test:release` | `pnpm rebuild && pnpm copy-licenses && node integration/packages/release.mjs` |
| `pnpm test:unit` | `pnpm lint:persistence && pnpm -r --no-bail test` |
| `pnpm verify:all` | `pnpm lint && pnpm test:unit && pnpm test:build && pnpm test:release && pnpm test:e2e` |

### Workspace scripts

| Workspace | Scripts |
| --- | --- |
| `api` | `build`, `clean`, `db:migrate`, `db:revert`, `dev`, `lint`, `permissions:rebuild`, `permissions:verify`, `rebuild`, `sessions:purge`, `start`, `start:fastify`, `start:prod`, `start:prod:fastify`, … (+5) |
| `packages/ddd-core` | `build`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
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
| `packages/pipeline-tenant` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
| `packages/pipeline-zod` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test` |
| `packages/safe-stringify` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |
| `packages/uuidv7` | `build`, `build:watch`, `clean`, `lint`, `prepublishOnly`, `rebuild`, `test`, `test:watch` |

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
  `unplugin-swc` (`api/vitest.config.ts`).
- **Locations**: `packages/*/src/**/*.spec.ts` and `packages/ddd-core/**/*.spec.ts` beside the code;
  `api/src/**/*.spec.ts` for unit/adapter specs; `api/test/*.spec.ts`
  for cross-module suites; `api/test/*.e2e-spec.ts` for end-to-end
  (`vitest.config.e2e.ts`, 60s timeout).
- **Naming**: `describe`/`it` state the domain behavior or invariant. Ticket and review
  identifiers are forbidden in test names and file names (`biome/plugins/test-suite.grit`).
- **Mocks and seams**: mock at the module boundary (`vi.mock('@nestjs/cqrs', …)`). No
  production export, parameter, option, branch, or retained state may exist only so a test
  can reach it.
- **Integration dependencies**: a published package must not depend on `@nestjs/testing` —
  tests needing a Nest application live in `api`. Suites that need PostgreSQL or
  Redis are in `api/test/` (for example `postgres-migrations.e2e-spec.ts`,
  `bullmq-deadletter.e2e-spec.ts`). Each bundled Postgres or Redis adapter has one there
  (`postgres-audit-dead-letter`, `postgres-idempotency-store`, `redis-idempotency-store`,
  `mikro-orm-cache.postgres`), except `RabbitMqDeadLetterTransport`. The default local path
  uses SQLite/libSQL and in-memory stores.
- **Environment**: copy `api/.env.example` to `.env` for local runs. Vitest sets
  `reflect-metadata` as a setup file.
- **Architecture guards run as tests**: `packages/pipeline/src/package-boundaries.spec.ts`,
  `packages/ddd-core/persistence/biome-*-plugin*.spec.ts`,
  `api/test/behavior-composition-contracts.spec.ts`,
  `cqrs-discovery-without-private-metadata.e2e-spec.ts`.
- **Release verification**: `pnpm test:release` packs every publishable package and loads it
  from its tarball in an isolated consumer (`integration/packages/README.md`). It checks root
  entry points only — not every subpath or dependency version.
- **Test-log helpers**: `test:all:full` runs coverage suites and writes `test-run.log`;
  `test:last:review`, `test:last:log` and `test:last:fails` inspect that log. These are
  reporting helpers, not replacements for build/typecheck/packed-release gates. The shell
  pipeline ends in `tee` without `pipefail`, so its exit status alone does not prove test success.
- **Known gaps** (`Observed, not exhaustively verified`): no combined monorepo coverage
  total (`pnpm test:coverage` reports per workspace); no CI configuration in the repository,
  so all suites are run locally.
<!-- context:manual-end testing-strategy -->

## Security and Operational Notes

<!-- context:manual-start security-notes -->
*Manual section — the generator never overwrites it. Names and mechanisms only; never a
secret value.*

- **Authentication boundary**: global `AuthSessionGuard` plus `SessionUserContextInterceptor`
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
- **Fail-closed behavior**: Fastify mode requires `SESSION_SECRET`; missing tenant context
  raises `MissingTenantContextError`.
- **Rate limiting**: `RateLimitBehavior` over `rate-limiter-flexible`, memory-backed by
  default and Redis-backed in production (`api/src/infrastructure/reliability.module.ts`).
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

- **Global logging defaults live in `ObservabilityModule`.** users-api sets
  `requestResponseLogLevel: 'log'` globally; handler `logging({...})` entries carry only deltas
  such as `mapLogLevel` and shallow-merge over it (`api/src/infrastructure/observability.module.ts`).
- **Private NestJS API in the bootstrap path.** `packages/pipeline/src/services/pipeline.bootstrap.service.ts`
  imports `@nestjs/cqrs/dist/services/explorer.service`. Accepted trade-off; a NestJS CQRS
  minor release can break handler discovery. Do not expand it or cite it as precedent.
- **Decorator order is load-bearing.** `@Cache → @AcknowledgePersisted → @MapPersistenceErrors`
  on `save()`, or `@PersistedWrite` alone, which applies that order. Inverting it acknowledges
  persistence before the write is durable. `pnpm lint:persistence`
  (`biome/plugins/persistence-lifecycle.grit`) fails on it, and on mixing both forms.
- **`optimisticUpdate` rejects outer transactions.** `em.isInTransaction()` makes it throw,
  because acknowledgment and cache eviction must happen at commit time
  (`packages/ddd-core/persistence/optimistic-update.ts`).
- **The aggregate setter lint is naming-based only.** `biome/plugins/aggregate-identity.grit`
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
- **Refresh failure boundaries:** token preparation precedes durable rotation; expiry/grace
  is checked again after preparation. Reuse revocation persists dirty aggregate state and
  retries version conflicts; exhausted retries propagate. Database persistence and cookie
  delivery are not atomic (`api/src/auths/cqrs/commands/refresh-auth.handler.ts`).
- **Field projection inherits parent grants.** `CaslAuthorizer.project` returns
  `profile.secret` under a `fields: ['profile']` grant while `can(…, 'profile.secret')` is
  `false` (`packages/pipeline-casl/src/helpers/projection.ts`).
- **A pipeline cache hit skips the handler's entity and field checks.** An outer type-level
  CASL check does not reproduce them (`AGENTS.md` rule 5; `packages/pipeline-cache`).
- **Repository caching and pipeline caching are separate layers with separate owners.**
  Entity invalidation does not invalidate a composed pipeline result. Do not move application
  composition into a repository to cache it (`packages/ddd-core/README.md`, `packages/pipeline-cache/README.md`).
- **`api` is an example, not the contract boundary.** A missing call site there does
  not prove a published export is unused (`AGENTS.md` → Library scope).
- **`ddd-core` root barrel is off-limits in users-api production code.** Import
  `/domain`, `/application` or `/persistence` (`biome/plugins/ddd-entry-points.grit`).
- **Tenant metadata must stay off ORM objects.** Use `EntityManagerTenantRegistry`, never a
  `__tenant` property on a MikroORM EntityManager (`api/src/persistence/README.md`).
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
- Generated at: 2026-09-25T10:37:48Z
- Git commit: 42d83759a9f88796ce205481460177aed9d06373
- Git branch: publish
- Uncommitted changes when generated: yes
- Generator: `scripts/update-claude-snapshot.py` version 1.0.0
- Snapshot status: generated — structural inspection only, no code executed
- Files inspected: 834
- Included top-level directories: `.agents`, `.claude`, `api`, `biome`, `integration`, `packages`, `scripts`
- Excluded directory names: `.cache`, `.git`, `.gradle`, `.idea`, `.mypy_cache`, `.next`, `.nuxt`, `.parcel-cache`, `.pnpm-store`, `.pytest_cache`, `.ruff_cache`, `.svelte-kit`, `.terraform`, `.tmp`, `.tox`, `.turbo`, `.venv`, `.vscode`, `__pycache__`, `bower_components`, `build`, `coverage`, `dist`, `node_modules`, `out`, `target`, `vendor`, `venv`, `virtualenv`
- Excluded file patterns: `.env`, `.env.*`, `*.env`, `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*.jks`, `*.keystore`, `id_rsa*`, `id_ed25519*`, `*credentials*`, `*.secret`, `secrets.*`

The four volatile fields above (timestamp, commit, branch, dirty flag) are ignored by
`--check`, so routine commits do not mark the map stale; structural drift does.
<!-- context:generated-end metadata -->
