---
title: "Overview"
---

Pipeline behaviors for **NestJS CQRS** — wrap every command, query, and event handler with reusable cross-cutting concerns (logging, validation, tracing, audit, …) using a clean middleware-like chain.

```
HTTP Request
  → Controller (schema validation)
  → CommandBus / QueryBus / EventBus
  → Pipeline chain:
      [global before] → [@UsePipeline behaviors] → [global after] → handler
```

> **Same-class override:** if a handler's `@UsePipeline` declares the same
> behavior class as a global `before`/`after` entry, the behavior runs **once at
> its global chain position**, using the handler's options. Preserving position
> keeps global security guards outside cache/idempotency behaviors that may
> short-circuit without calling `next()`.
>
> Global type-level guards do not replace entity checks or field filtering
> performed inside a handler. Because cache/idempotency hits skip that handler,
> their keys must include the relevant tenant, principal, and permission scope
> whenever results depend on those checks.

The core package adds no runtime dependencies beyond NestJS itself, apart from the
dependency-free `@cqrs-ddd/uuidv7`, `@cqrs-ddd/safe-stringify` and `@cqrs-ddd/untyped`.
`@nestjs-pipeline/tenant`, `/correlation` and `/job-context` depend on no other pipeline
package. Add-on packages use their own declared integrations (Zod, OpenTelemetry, CASL,
OpenFeature, etc.). Works with Express and Fastify.

## Library scope

The packages are reusable libraries for external applications and future use
cases. `api` is one example, not the limit of the public contracts.
Repository caching and pipeline query-result caching are complementary. See
[AGENTS.md](https://github.com/aristoteliss/nestjs-pipeline/blob/master/AGENTS.md) for library scope and the criteria for reviewing or
removing features, and the
[architecture skill](https://github.com/aristoteliss/nestjs-pipeline/blob/master/.agents/skills/nestjs-pipeline-architecture/SKILL.md) for
cache layer ownership, command reads, invalidation and security.

## Packages

| Package | Description |
|---|---|
| [`@nestjs-pipeline/core`](/nestjs-pipeline/packages/nestjs-pipeline/core/) | Pipeline engine, `@UsePipeline` decorator, `PipelineModule`, `LoggingBehavior` |
| [`@nestjs-pipeline/correlation`](/nestjs-pipeline/packages/nestjs-pipeline/correlation/) | Standalone correlation ID propagation — HTTP middleware, `@WithCorrelation`, `runWithCorrelationId`, `getCorrelationId`, and `correlationSource` for pipelines and jobs |
| [`@nestjs-pipeline/zod`](/nestjs-pipeline/packages/nestjs-pipeline/zod/) | Zod v4 validation/parsing behavior that applies successful parsed object output to the request, plus `zodBadRequest` for Nest's schema validation, `ZodValidationFilter`, `ZodValidationError` |
| [`@nestjs-pipeline/opentelemetry`](/nestjs-pipeline/packages/nestjs-pipeline/opentelemetry/) | OpenTelemetry tracing & metrics behaviors — spans plus duration/throughput/error instruments for every pipeline invocation, and `AttributesBehavior` for the add-ons' span attributes |
| [`@nestjs-pipeline/casl`](/nestjs-pipeline/packages/nestjs-pipeline/casl/) | CASL authorization — type-level `CaslBehavior` fed by an application permission source, plus `CaslAuthorizer` (`can`, `authorize`, `project`, `dependsOnEntity`) for entity and field checks and `abilityDigest` for cache and replay scopes |
| [`@nestjs-pipeline/resilience`](/nestjs-pipeline/packages/nestjs-pipeline/resilience/) | Resilience on cockatiel — named policies for outbound dependencies (retry, circuit breaker, timeout, bulkhead, fallback), shared through DI, and a behavior for handler-level retry, timeout and bulkhead |
| [`@nestjs-pipeline/cache`](/nestjs-pipeline/packages/nestjs-pipeline/cache/) | Read-through caching behavior for queries — pluggable stores (memory, redis, memcache, sqlite, postgres) via cache-manager v7 on keyv |
| [`@nestjs-pipeline/feature-flags`](/nestjs-pipeline/packages/nestjs-pipeline/feature-flags/) | Feature-flag gating behavior — provider-agnostic via OpenFeature (Unleash shown in examples; Flagsmith/LaunchDarkly are drop-in alternatives) |
| [`@nestjs-pipeline/deadletter`](/nestjs-pipeline/packages/nestjs-pipeline/deadletter/) | Dead-letter capture for failed requests (events by default) — bundled BullMQ, RabbitMQ and Postgres transports; redrive with an attempt count and a resolved state for stored records |
| [`@nestjs-pipeline/rate-limit`](/nestjs-pipeline/packages/nestjs-pipeline/rate-limit/) | Rate-limiting behavior — backend-agnostic via rate-limiter-flexible (memory, Redis/Valkey, Mongo, SQL), HTTP 429 filter |
| [`@nestjs-pipeline/audit`](/nestjs-pipeline/packages/nestjs-pipeline/audit/) | Audit-trail behavior — records who/what/outcome/duration to a pluggable `AuditSink` (console default, Postgres drop-in), with payload redaction |
| [`@nestjs-pipeline/idempotency`](/nestjs-pipeline/packages/nestjs-pipeline/idempotency/) | Idempotency behavior — atomic concurrent duplicate exclusion and successful-response replay per key; failed executions are retryable by default, via a pluggable store (in-memory default, Redis/Postgres drop-in) |
| [`@nestjs-pipeline/tenant`](/nestjs-pipeline/packages/nestjs-pipeline/tenant/) | `currentTenantId()`, `runWithTenant()` and `tenantSource` — the current tenant, for code deep inside a handler and for pipelines and jobs |
| [`@nestjs-pipeline/job-context`](/nestjs-pipeline/packages/nestjs-pipeline/job-context/) | Carries a request's tenant, correlation id and principal into the queue jobs it enqueues (`withJobContext`, `@InJobContext`), and gives system work an explicit context (`@AsSystem`) |

> Add-on packages live in `packages/pipeline-<name>/`. Those that plug into the pipeline
> peer-depend on `@nestjs-pipeline/core`; `tenant`, `correlation` and `job-context` depend on
> no pipeline package and are connected through module options (`sources`).

Framework-neutral packages, with no NestJS dependency:

| Package | Description |
|---|---|
| [`@cqrs-ddd/core`](/nestjs-pipeline/packages/cqrs-ddd/core/) | DDD building blocks — aggregates with versioned mutations, detached domain events, `CommandBaseHandler`, repository contracts, ORM-neutral persistence lifecycle decorators, a revision-fenced repository cache, tenant-scoped cache keys and HTTP status mapping |
| [`@cqrs-ddd/mikro-orm`](/nestjs-pipeline/packages/cqrs-ddd/mikro-orm/) | MikroORM 7 adapters for `@cqrs-ddd/core` — `AggregateRepository`, version-conditioned writes, `MikroOrmCache`, `MikroOrmDialect`, the multi-tenant `TenantStore` |
| [`@cqrs-ddd/uuidv7`](/nestjs-pipeline/packages/cqrs-ddd/uuidv7/) | RFC 9562 UUIDv7 generation and validation, with no dependencies |
| [`@cqrs-ddd/safe-stringify`](/nestjs-pipeline/packages/cqrs-ddd/safe-stringify/) | A strict, key-sorted serializer for identities, a redacting serializer for logs, and the key-segment helpers, with no dependencies |
| [`@cqrs-ddd/untyped`](/nestjs-pipeline/packages/cqrs-ddd/untyped/) | `untyped(value)`: a typed replacement for `as any` that reads undeclared properties as `unknown`, with no dependencies |

> `@nestjs-pipeline/core` uses the three utilities; import them from their own packages.
> No `@nestjs-pipeline/*` package uses `@cqrs-ddd/core`, and it knows nothing of them: an
> application connects the two.

Every package is at **0.4.1**. [CHANGELOG.md](/nestjs-pipeline/changelog/) records each release.
