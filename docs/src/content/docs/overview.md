---
title: "Overview"
---

Pipeline behaviors for **NestJS CQRS** — wrap every command, query, and event handler with reusable cross-cutting concerns (logging, validation, tracing, audit, idempotency, caching, rate limiting, and resilience) using a clean, deterministic pipeline chain.

```
HTTP Request / Queue Job
  → Presentation / Controller (route parameters, schema validation)
  → CommandBus / QueryBus / EventBus (official @nestjs/cqrs)
  → Pipeline Runner:
      [global before] → [@UsePipeline handler behaviors] → [global after] → handler.execute()
```

For the complete interactive map through all four Clean Architecture layers with clickable source links, see [Runtime architecture](/nestjs-pipeline/concepts/architecture/).

## Core Architectural Model

NestJS CQRS applications (`@nestjs/cqrs`) manage handlers, dependency injection, and bus dispatching. The pipeline enhances those handlers with deterministic cross-cutting behaviors without replacing NestJS CQRS primitives:

1. **Official NestJS CQRS at the core**: `CommandBus`, `QueryBus`, `EventBus`, `@CommandHandler`, `@QueryHandler`, `@EventsHandler`, and `EventPublisher` operate standard NestJS workflows.
2. **Framework-neutral behaviors**: The behaviors (`@cqrs-ddd/pipeline-*`) are decoupled from NestJS and implemented as pure classes implementing `IPipelineBehavior`.
3. **Singleton DI provider registration**: Every behavior instance is registered in its owning feature module as a standard NestJS singleton provider under its behavior class token (e.g. `provide: IdempotencyBehavior, useFactory: ...`).
4. **Declarative pipeline compilation**: Handlers declare local behaviors and options with `@UsePipeline(...)` and `@SkipPipeline(...)`.
5. **Fail-fast bootstrap**: At application startup, `PipelineBootstrap` (from `@cqrs-ddd/nestjs`) discovers handlers via `DiscoveryService`, asserts that handler dependency trees are strictly static (singleton-scoped), validates ordering contracts (e.g. CASL authorization before response caching), and wraps `execute()` or `handle()` once.
6. **Unified error and context boundary**: `@cqrs-ddd/nestjs` provides `ErrorFilter` (mapping domain and pipeline errors to standard NestJS HTTP error responses), `CorrelationMiddleware`, and `JobContextModule`.

> **Same-class override:** If a handler's `@UsePipeline` declares the same behavior class as a global `before` or `after` entry, the behavior runs **once at its global chain position**, using the handler's options. Preserving position keeps global security guards outside cache/idempotency behaviors that may short-circuit without calling `next()`.
>
> **Security context requirement:** Global type-level guards do not replace entity checks or field filtering performed inside a handler. Because cache and idempotency hits skip that handler, their keys must include tenant, principal, and permission scope whenever results depend on those checks. Fails closed when required security context is absent.

## Packages

### NestJS Integration & Adapter

| Package | Description |
|---|---|
| [`@cqrs-ddd/nestjs`](/nestjs-pipeline/packages/cqrs-ddd/nestjs/) | Official NestJS adapter — `PipelineModule.forRoot()`, `PipelineBootstrap`, `ErrorFilter`, `CorrelationMiddleware`, and `JobContextModule` |
| `@nestjs-pipeline/cqrs-ddd` | Package facade re-exporting `@cqrs-ddd/nestjs` for smooth upgrade paths |

### Pipeline Engine & Behaviors

| Package | Description |
|---|---|
| [`@cqrs-ddd/pipeline`](/nestjs-pipeline/packages/nestjs-pipeline/core/) | Core pipeline engine — `@UsePipeline`, `@SkipPipeline`, plan compilation, behavior contract diagnostics, `LoggingBehavior`, and `logging()` builder |
| [`@cqrs-ddd/pipeline-idempotency`](/nestjs-pipeline/packages/nestjs-pipeline/idempotency/) | Idempotency behavior — atomic concurrent duplicate exclusion and successful-response replay per key with payload fingerprinting; in-memory, Redis, and Postgres stores |
| [`@cqrs-ddd/pipeline-cache`](/nestjs-pipeline/packages/nestjs-pipeline/cache/) | Read-through query result caching — pluggable stores (memory, Redis, Memcached, SQLite, Postgres) via cache-manager v7 and Keyv |
| [`@cqrs-ddd/pipeline-casl`](/nestjs-pipeline/packages/nestjs-pipeline/casl/) | CASL authorization — type-level `CaslBehavior` fed by an application permission source, plus `CaslAuthorizer` (`can`, `authorize`, `project`) and `abilityDigest` for cache/replay scopes |
| [`@cqrs-ddd/pipeline-audit`](/nestjs-pipeline/packages/nestjs-pipeline/audit/) | Operational audit logging — captures caller, action, duration, payload metadata, and outcome to a pluggable `AuditSink` (log sink default, Postgres drop-in) |
| [`@cqrs-ddd/pipeline-rate-limit`](/nestjs-pipeline/packages/nestjs-pipeline/rate-limit/) | Rate limiting behavior — backend-agnostic quotas via rate-limiter-flexible (memory, Redis/Valkey, Mongo, Postgres, MySQL) and HTTP 429 translation |
| [`@cqrs-ddd/pipeline-resilience`](/nestjs-pipeline/packages/nestjs-pipeline/resilience/) | Resilience policies via cockatiel — handler-level retry, circuit breaker, timeout, bulkhead, and fallback with telemetry events |
| [`@cqrs-ddd/pipeline-deadletter`](/nestjs-pipeline/packages/nestjs-pipeline/deadletter/) | Dead-letter capture for failed commands and events — bundled BullMQ, RabbitMQ, and Postgres transports with redrive support |
| [`@cqrs-ddd/pipeline-feature-flags`](/nestjs-pipeline/packages/nestjs-pipeline/feature-flags/) | Feature flag gating — OpenFeature standard evaluation client (in-memory, Unleash, Flagsmith, LaunchDarkly) |
| [`@cqrs-ddd/pipeline-opentelemetry`](/nestjs-pipeline/packages/nestjs-pipeline/opentelemetry/) | OpenTelemetry tracing and metrics — span lifecycle (`TraceBehavior`), throughput/error instruments (`MetricsBehavior`), and `AttributesBehavior` |
| [`@cqrs-ddd/pipeline-zod`](/nestjs-pipeline/packages/nestjs-pipeline/zod/) | Zod schema validation — `ZodValidationBehavior` parsing and applying sanitized input to commands/queries |
| [`@cqrs-ddd/pipeline-tenant`](/nestjs-pipeline/packages/nestjs-pipeline/tenant/) | Multi-tenant isolation — `currentTenantId()`, `runWithTenant()`, and `tenantSource` async context propagation |
| [`@cqrs-ddd/pipeline-correlation`](/nestjs-pipeline/packages/nestjs-pipeline/correlation/) | Request correlation propagation — `getCorrelationId()`, `runWithCorrelationId()`, `@WithCorrelation`, and `correlationSource` |
| [`@cqrs-ddd/pipeline-job-context`](/nestjs-pipeline/packages/nestjs-pipeline/job-context/) | Queue job context propagation — propagates tenant, correlation ID, and principal into background jobs (`withJobContext`, `@InJobContext`, `@AsSystem`) |

### Framework-Neutral DDD Primitives

| Package | Description |
|---|---|
| [`@cqrs-ddd/core`](/nestjs-pipeline/packages/cqrs-ddd/core/) | DDD building blocks — aggregates with versioned mutations, detached domain events, `CommandBaseHandler`, repository contracts, ORM-neutral persistence lifecycle decorators (`@PersistedWrite`), repository caching (`@FromCache`), and tenant-scoped keys |
| [`@cqrs-ddd/mikro-orm`](/nestjs-pipeline/packages/cqrs-ddd/mikro-orm/) | MikroORM 7 adapters for `@cqrs-ddd/core` — `AggregateRepository`, version-conditioned writes (`optimisticUpdate`), `MikroOrmCache`, and multi-tenant schema routing |
| [`@cqrs-ddd/uuidv7`](/nestjs-pipeline/packages/cqrs-ddd/uuidv7/) | RFC 9562 UUIDv7 generation and validation (zero dependencies) |
| [`@cqrs-ddd/safe-stringify`](/nestjs-pipeline/packages/cqrs-ddd/safe-stringify/) | Key-sorted serializer for cache/idempotency identities and redacting serializer for structured logs (zero dependencies) |
| [`@cqrs-ddd/untyped`](/nestjs-pipeline/packages/cqrs-ddd/untyped/) | Type-safe replacement for `as any` reading undeclared properties as `unknown` (zero dependencies) |

## Library Scope and Contract Discipline

The packages are reusable libraries designed for external production applications. The example `api` showcases their end-to-end orchestration but does not define the limits of the public contracts.

Repository snapshot caching (`@FromCache`, `@Cache`) and pipeline query result caching (`CacheBehavior`) are complementary:
- The persistence adapter owns entity snapshots and invalidation lifecycles because it knows aggregate write mutations.
- The application pipeline owns composed query results because it knows caller-facing freshness, security scopes, and authorization boundaries.

See [Runtime architecture](/nestjs-pipeline/concepts/architecture/) for the interactive architecture map and [Getting started](/nestjs-pipeline/getting-started/) for setup guidance.
