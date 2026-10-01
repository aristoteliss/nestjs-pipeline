# nestjs-pipeline

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

### Library scope

The packages are reusable libraries for external applications and future use
cases. `api` is one example, not the limit of the public contracts.
Repository caching and pipeline query-result caching are complementary. See
[AGENTS.md](AGENTS.md) for library scope and the criteria for reviewing or
removing features, and the
[architecture skill](.agents/skills/nestjs-pipeline-architecture/SKILL.md) for
cache layer ownership, command reads, invalidation and security.

---

## Table of Contents

- [Packages](#packages)
- [Upgrading from 0.2.x](#upgrading-from-02x)
- [What's new in 0.2.2](#whats-new-in-022)
- [What's new in 0.2.1](#whats-new-in-021)
- [Upgrading from 0.1.x](#upgrading-from-01x)
- [Quick Start](#quick-start)
  - [1  Install](#1-install)
  - [2  Register the Module](#2-register-the-module)
  - [3  Define a Command with Zod Validation](#3-define-a-command-with-zod-validation)
  - [4  Write the Handler](#4-write-the-handler)
  - [5  Wire Up the Controller](#5-wire-up-the-controller)
  - [6  Bootstrap the Application](#6-bootstrap-the-application)
- [Writing Custom Behaviors](#writing-custom-behaviors)
  - [Example: Metrics Behavior](#example-metrics-behavior)
  - [Example: Audit-Trail Behavior with Options](#example-audit-trail-behavior-with-options)
  - [Example: Caching Behavior](#example-caching-behavior)
  - [Example: Retry Behavior](#example-retry-behavior)
  - [Registering Behaviors](#registering-behaviors)
- [Pipeline Execution Model](#pipeline-execution-model)
  - [Execution Order](#execution-order)
  - [Deduplication](#deduplication)
- [Correlation IDs](#correlation-ids)
  - [HTTP Requests](#http-requests)
  - [Bull Queue Processor](#bull-queue-processor)
  - [RabbitMQ Handler](#rabbitmq-handler)
  - [Cron Jobs](#cron-jobs)
  - [Nested Commands (Sagas)](#nested-commands-sagas)
  - [@WithCorrelation Decorator](#withcorrelation-decorator)
  - [Producer-Side: Stamping Correlation IDs](#producer-side-stamping-correlation-ids)
- [Pipeline Context Reference](#pipeline-context-reference)
  - [Properties](#properties)
  - [Using items for Inter-Behavior Communication](#using-items-for-inter-behavior-communication)
  - [Behavior Options](#behavior-options)
- [Built-in LoggingBehavior](#built-in-loggingbehavior)
- [Zod Integration](#zod-integration-nestjs-pipelinezod)
  - [Pipeline-Level Validation](#pipeline-level-validation)
  - [Controller-Level Validation](#controller-level-validation)
  - [Zod Transform Mappers (DTO → Command)](#zod-transform-mappers-dto--command)
  - [Error Handling with ZodValidationFilter](#error-handling-with-zodvalidationfilter)
  - [Attaching Schemas to Plain Event Classes](#attaching-schemas-to-plain-event-classes)
- [OpenTelemetry Integration](#opentelemetry-integration-nestjs-pipelineopentelemetry)
  - [Setup](#setup)
  - [Span Details](#span-details)
  - [No SDK? No Problem.](#no-sdk-no-problem)
- [DDD Example](#ddd-example)
- [Repository Structure](#repository-structure)
- [Development](#development)
  - [Agent context files](#agent-context-files)
- [Adding a New Behavior Package](#adding-a-new-behavior-package)
- [License and Commercial Use](#license-and-commercial-use)

---

## Packages

| Package | Description |
|---|---|
| [`@nestjs-pipeline/core`](packages/pipeline) | Pipeline engine, `@UsePipeline` decorator, `PipelineModule`, `LoggingBehavior` |
| [`@nestjs-pipeline/correlation`](packages/pipeline-correlation) | Standalone correlation ID propagation — HTTP middleware, `@WithCorrelation`, `runWithCorrelationId`, `getCorrelationId`, and `correlationSource` for pipelines and jobs |
| [`@nestjs-pipeline/zod`](packages/pipeline-zod) | Zod v4 validation/parsing behavior that applies successful parsed object output to the request, plus `zodBadRequest` for Nest's schema validation, `ZodValidationFilter`, `ZodValidationError` |
| [`@nestjs-pipeline/opentelemetry`](packages/pipeline-opentelemetry) | OpenTelemetry tracing & metrics behaviors — spans plus duration/throughput/error instruments for every pipeline invocation, and `AttributesBehavior` for the add-ons' span attributes |
| [`@nestjs-pipeline/casl`](packages/pipeline-casl) | CASL authorization — type-level `CaslBehavior` fed by an application permission source, plus `CaslAuthorizer` (`can`, `authorize`, `project`, `dependsOnEntity`) for entity and field checks and `abilityDigest` for cache and replay scopes |
| [`@nestjs-pipeline/resilience`](packages/pipeline-resilience) | Resilience on cockatiel — named policies for outbound dependencies (retry, circuit breaker, timeout, bulkhead, fallback), shared through DI, and a behavior for handler-level retry, timeout and bulkhead |
| [`@nestjs-pipeline/cache`](packages/pipeline-cache) | Read-through caching behavior for queries — pluggable stores (memory, redis, memcache, sqlite, postgres) via cache-manager v7 on keyv |
| [`@nestjs-pipeline/feature-flags`](packages/pipeline-feature-flags) | Feature-flag gating behavior — provider-agnostic via OpenFeature (Unleash shown in examples; Flagsmith/LaunchDarkly are drop-in alternatives) |
| [`@nestjs-pipeline/deadletter`](packages/pipeline-deadletter) | Dead-letter capture for failed requests (events by default) — bundled BullMQ, RabbitMQ and Postgres transports; redrive with an attempt count and a resolved state for stored records |
| [`@nestjs-pipeline/rate-limit`](packages/pipeline-rate-limit) | Rate-limiting behavior — backend-agnostic via rate-limiter-flexible (memory, Redis/Valkey, Mongo, SQL), HTTP 429 filter |
| [`@nestjs-pipeline/audit`](packages/pipeline-audit) | Audit-trail behavior — records who/what/outcome/duration to a pluggable `AuditSink` (console default, Postgres drop-in), with payload redaction |
| [`@nestjs-pipeline/idempotency`](packages/pipeline-idempotency) | Idempotency behavior — atomic concurrent duplicate exclusion and successful-response replay per key; failed executions are retryable by default, via a pluggable store (in-memory default, Redis/Postgres drop-in) |
| [`@nestjs-pipeline/tenant`](packages/pipeline-tenant) | `currentTenantId()`, `runWithTenant()` and `tenantSource` — the current tenant, for code deep inside a handler and for pipelines and jobs |
| [`@nestjs-pipeline/job-context`](packages/pipeline-job-context) | Carries a request's tenant, correlation id and principal into the queue jobs it enqueues (`withJobContext`, `@InJobContext`), and gives system work an explicit context (`@AsSystem`) |

> Add-on packages live in `packages/pipeline-<name>/`. Those that plug into the pipeline
> peer-depend on `@nestjs-pipeline/core`; `tenant`, `correlation` and `job-context` depend on
> no pipeline package and are connected through module options (`sources`).

Framework-neutral packages, with no NestJS dependency:

| Package | Description |
|---|---|
| [`@cqrs-ddd/core`](packages/ddd-core) | DDD building blocks — aggregates with versioned mutations, detached domain events, `CommandBaseHandler`, repository contracts, ORM-neutral persistence lifecycle decorators, a revision-fenced repository cache, tenant-scoped cache keys and HTTP status mapping |
| [`@cqrs-ddd/mikro-orm`](packages/ddd-mikro-orm) | MikroORM 7 adapters for `@cqrs-ddd/core` — `AggregateRepository`, version-conditioned writes, `MikroOrmCache`, `MikroOrmDialect`, the multi-tenant `TenantStore` |
| [`@cqrs-ddd/uuidv7`](packages/uuidv7) | RFC 9562 UUIDv7 generation and validation, with no dependencies |
| [`@cqrs-ddd/safe-stringify`](packages/safe-stringify) | A strict, key-sorted serializer for identities, a redacting serializer for logs, and the key-segment helpers, with no dependencies |
| [`@cqrs-ddd/untyped`](packages/untyped) | `untyped(value)`: a typed replacement for `as any` that reads undeclared properties as `unknown`, with no dependencies |

> `@nestjs-pipeline/core` uses the three utilities; import them from their own packages.
> No `@nestjs-pipeline/*` package uses `@cqrs-ddd/core`, and it knows nothing of them: an
> application connects the two.

Every package is at **0.3.0**. [CHANGELOG.md](CHANGELOG.md) records each release.

---

## Upgrading from 0.2.x

0.3.0 moves every package to NestJS 12. Every change is listed in
[CHANGELOG.md](CHANGELOG.md); the ones below need a change in most applications.

**1. NestJS 12.1 and Node.js 22.12.** Every package declares `engines.node >=22.12.0`
(`@cqrs-ddd/mikro-orm` `>=22.17.0`, as MikroORM 7 requires), and
every `@nestjs/common`, `@nestjs/core` and `@nestjs/cqrs` peer is `^12.1.0`. Packages that
peer on `@nestjs-pipeline/core` require `^0.3.0` of it. NestJS 12.0.x is not supported: it
drops the `@Optional()` markers of a base class in a subclass that declares no constructor
of its own, so such a subclass of a behavior fails to resolve its optional dependencies.

```bash
pnpm add @nestjs/common@^12.1.0 @nestjs/core@^12.1.0 @nestjs/cqrs@^12.1.0 @nestjs-pipeline/core@^0.3.0
```

**2. A CommonJS application compiles with TypeScript `module` `nodenext`, `node20` or
`bundler`.** NestJS 12 publishes ES modules, which a CommonJS application loads through
Node's `require()` of ES modules (Node.js 22.12). With `module: node16`, TypeScript refuses
those imports (TS1479).

**3. `ZodPipe` is removed.** Declare the schema on the parameter and register Nest's
`StandardSchemaValidationPipe` once with `zodBadRequest`; the 400 body is the one
`ZodValidationFilter` gives:

```typescript
// app.module.ts
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { zodBadRequest } from '@nestjs-pipeline/zod';

@Module({
  providers: [
    {
      provide: APP_PIPE,
      useValue: new StandardSchemaValidationPipe({ exceptionFactory: zodBadRequest }),
    },
  ],
})
export class AppModule {}

// users.controller.ts
getUser(@Param('id', { schema: UserIdSchema }) id: string) {}
```

**4. Register `IdempotencyConflictFilter`.** NestJS 12's default exception filter answers a
plain `Error` that carries a `statusCode` with 500. `IdempotencyConflictError` is one, so
without the filter a request whose idempotency key is still running or was reused answers
500 instead of 409 or 422. The bundled filters register as described in
[What's new in 0.2.2](#whats-new-in-022).

**5. cockatiel 4.** `@nestjs-pipeline/resilience` requires `cockatiel` `^4.0.0`, an ES
module. Its policies report errors as `unknown`; narrow them before reading `message`.

**6. rate-limiter-flexible 11.** `@nestjs-pipeline/rate-limit` declares no peer on it and is
tested with 11, which throws when a limiter is created without a finite `points` or
`duration`.

**7. Domain events carry a dispatcher context.** `@cqrs-ddd/core`'s `CommandBaseHandler`
calls `publishAll(events, aggregate)`, so a publisher that reads a second argument receives
the aggregate, as NestJS's `EventPublisher` passes it. `AggregateRoot.commit(context?)`
passes its context to `publishAll` and returns the publisher's result, and
`IAggregateRoot` describes the contract that both this package's and NestJS's aggregates
satisfy.

---

## What's new in 0.2.2

0.2.2 changes how the exception filters of `@nestjs-pipeline/zod`, `/casl`,
`/feature-flags`, `/idempotency` and `/rate-limit` answer, so that one code path serves
Express and Fastify. Registering them needs a change, and the five packages add a
`@nestjs/core` `^11.0.0` peer.

### Exception filters reply through Nest's HTTP adapter

`ZodValidationFilter`, `UnauthorizedActionFilter`, `FeatureDisabledFilter`,
`IdempotencyConflictFilter` and `RateLimitExceededFilter` take Nest's `HttpAdapterHost` and
answer with `httpAdapter.reply` (`RateLimitExceededFilter` also sets `Retry-After` through
the adapter). On Fastify, an error thrown in Nest middleware reaches a filter with the raw
Node response; the filters answer it too, instead of throwing and leaving the request
without a response.

Register each filter as a provider, so Nest injects the host:

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';

@Module({
  providers: [{ provide: APP_FILTER, useClass: ZodValidationFilter }],
})
export class AppModule {}
```

or pass it in `main.ts`:
`app.useGlobalFilters(new ZodValidationFilter(app.get(HttpAdapterHost)))`. A filter built
without the host (`new ZodValidationFilter()`) does not compile. `FeatureDisabledFilter`
takes its options as the second argument:
`new FeatureDisabledFilter(app.get(HttpAdapterHost), options)`.

---

## What's new in 0.2.1

0.2.1 only adds: no 0.2.0 export, signature or behavior changes, and no peer range moves.
Upgrade the ten packages above to `^0.2.1` to use the following.

### Span attributes from every add-on

Each add-on publishes its decision as a `context.items` entry and now exports a builder
that turns it into flat attributes, `{}` when the behavior did not run and never a key.
`AttributesBehavior` of `@nestjs-pipeline/opentelemetry` runs the builders you choose
after the chain has finished and adds the result to the attributes `TraceBehavior` puts on
the span:

```typescript
import { buildCacheAttributes } from '@nestjs-pipeline/cache';
import { buildDeadLetterAttributes } from '@nestjs-pipeline/deadletter';
import { buildFeatureFlagAttributes } from '@nestjs-pipeline/feature-flags';
import { buildIdempotencyAttributes } from '@nestjs-pipeline/idempotency';
import {
  AttributesBehavior,
  MetricsBehavior,
  TraceBehavior,
} from '@nestjs-pipeline/opentelemetry';
import { buildRateLimitAttributes } from '@nestjs-pipeline/rate-limit';

PipelineModule.forRoot({
  globalBehaviors: {
    before: [
      TraceBehavior,
      MetricsBehavior,
      [AttributesBehavior, {
        factories: [
          buildFeatureFlagAttributes, // feature_flag.key, .enabled, .variant, .reason, .error_code
          buildCacheAttributes,       // cache.hit
          buildIdempotencyAttributes, // idempotency.replayed, .ownership_lost
          buildRateLimitAttributes,   // rate_limit.remaining_points
          buildDeadLetterAttributes,  // dead_letter.captured
        ],
      }],
    ],
  },
});
```

The builders are plain data, not telemetry-only. Wrap one to rename an attribute, or use
it as audit metadata, with `audit()` declared outside the behavior it describes:

```typescript
const cacheHit = (context: IPipelineContext) => {
  const { 'cache.hit': hit } = buildCacheAttributes(context);
  return hit === undefined ? {} : { 'app.cache_hit': hit };
};

@UsePipeline(
  audit({ action: 'order.create', metadata: buildIdempotencyAttributes }),
  idempotent({ keyFactory }),
)
```

### A ready-made permission digest

`@nestjs-pipeline/casl` exports `abilityDigest(context?)`: the SHA-256 of the caller's
effective rules, with conditions already resolved against the principal, so any change
that can change a decision changes it. Use it as the scope of a principal-scoped cache
key, and `requireAbilityDigest`, which throws `MissingAbilityError` without an ability,
as an idempotency replay scope:

```typescript
import { abilityDigest, getCaslPrincipal, requireAbilityDigest } from '@nestjs-pipeline/casl';

const overviewKey = createPartitionedCacheKeyFactory({
  principal: (ctx) => getCaslPrincipal(ctx)?.id,
  scope: abilityDigest,
});

@UsePipeline(idempotent({ keyFactory, replayScopeFactory: requireAbilityDigest }))
```

`CaslAuthorizer.dependsOnEntity(action, subject)` tells a handler that a conditional rule
decides on entity attributes, so it reads the entity fresh instead of from a cache:

```typescript
const refresh = this.authorizer.dependsOnEntity('read', 'User');
const user = await this.users.find(new GetUserQuery({ userId }, { refresh }));
```

### Tenant with the purpose first

`@cqrs-ddd/core` adds `requireTenant(purpose, source?)`. It returns the tenant from
`source`, or from the resolver registered with `setTenantResolver`, and throws
`MissingTenantContextError` when there is none:

```typescript
import { requireTenant } from '@cqrs-ddd/core/application';

requireTenant('access token issuance');           // the current tenant
requireTenant('users.create idempotency key', ctx); // ctx.tenantId, else the current one
```

`requireTenantId(source, purpose)` keeps working and is deprecated: swap the arguments and
call `requireTenant`.

---

## Upgrading from 0.1.x

0.2.0 breaks the API of the five packages that were on npm before:
`@nestjs-pipeline/core` 0.1.18, `/correlation`, `/opentelemetry`, `/zod` and `/casl`.
Every change is listed per package in [CHANGELOG.md](CHANGELOG.md); the ones below need a
code change in most applications.

**1. Node.js 22 and NestJS 11.** Every package declares `engines.node >=22`. Core requires
`@nestjs/common`, `@nestjs/core` and `@nestjs/cqrs` `^11.0.0`; `/correlation`,
`/opentelemetry`, `/zod` and `/casl` require `@nestjs/common` `^11.0.0`, and the last three
also require `@nestjs-pipeline/core` `^0.2.0` (it was `*`). Core now installs
`@cqrs-ddd/uuidv7`, `@cqrs-ddd/untyped` and `@cqrs-ddd/safe-stringify` as dependencies.

**2. Tenant and correlation id come from `sources`.** The module options
`correlationIdFactory` and `correlationIdRunner` are removed. Pass the stores of
`@nestjs-pipeline/correlation` (and, for multi-tenant applications, `@nestjs-pipeline/tenant`)
instead:

```typescript
// 0.1.x
import { getCorrelationId, runWithCorrelationId } from '@nestjs-pipeline/correlation';

PipelineModule.forRoot({
  correlationIdFactory: getCorrelationId,
  correlationIdRunner: runWithCorrelationId,
  globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
});

// 0.2.0
import { correlationSource } from '@nestjs-pipeline/correlation';
import { tenantSource } from '@nestjs-pipeline/tenant';

PipelineModule.forRoot({
  sources: { tenantId: tenantSource, correlationId: correlationSource },
  globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
});
```

Without `sources`, bootstrap logs a warning; `sources: {}` silences it when you use neither
package.

**3. `correlationStore` and `setCorrelationFallback` are gone.** Read and set the ID through
the functions, which keep their API (`HttpCorrelationMiddleware` and `addCorrelationId` do
change; see the [correlation migration notes](packages/pipeline-correlation/README.md#migrating-from-01x)):

```typescript
// 0.1.x
import { correlationStore } from '@nestjs-pipeline/correlation';
correlationStore.run(job.id, () => this.commandBus.execute(command));
const id = correlationStore.getStore();

// 0.2.0
import { getCorrelationId, runWithCorrelationId } from '@nestjs-pipeline/correlation';
await runWithCorrelationId(job.id, () => this.commandBus.execute(command));
const id = getCorrelationId();
```

**4. The correlation ID of a running pipeline is read-only.** `originalCorrelationId` is
removed, and a behavior can no longer assign `context.correlationId`. Set the ID where the
work enters instead: `HttpCorrelationMiddleware`, `@WithCorrelation()` or
`runWithCorrelationId()`.

```typescript
// 0.1.x — inside a behavior
context.correlationId = request.headers['x-request-id'];

// 0.2.0 — where the work enters
await runWithCorrelationId(message.properties.correlationId, () =>
  this.commandBus.execute(command),
);
```

**5. Utilities move to their own packages.** Core no longer exports `uuidv7`, `isUuidV7` and
`untyped`, and `/correlation` no longer exports `uuidv7`:

```typescript
// 0.1.x
import { untyped, uuidv7 } from '@nestjs-pipeline/core';
import { uuidv7 } from '@nestjs-pipeline/correlation';

// 0.2.0
import { untyped } from '@cqrs-ddd/untyped';
import { isUuidV7, uuidv7 } from '@cqrs-ddd/uuidv7';
```

**6. Core internals are no longer exported.** `PipelineBootstrapService`,
`PIPELINE_MODULE_OPTIONS`, `PIPELINE_OPTIONS_REGISTRY`, `clearPipelineOptionsRegistry`,
`SET_RESPONSE` and `SET_ORIGINAL_CORRELATION_ID` are internal. Configure the pipeline through
`PipelineModule.forRoot` or the new `forRootAsync`:

```typescript
PipelineModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    bootstrapLogLevel: config.get('PIPELINE_LOG_LEVEL') ?? 'debug',
  }),
});
```

**7. Bootstrap diagnostics are strict by default.** The new `diagnostics` option defaults to
`'strict'`: a handler whose behavior declares a `PIPELINE_BEHAVIOR_CONTRACT` that the
handler's pipeline does not meet makes bootstrap throw a `PipelineConfigurationError`, which
lists each handler, behavior and fix. Fix the reported handler, or relax the check while you do:

```typescript
PipelineModule.forRoot({ sources: {}, diagnostics: 'warn' }); // or 'off'
```

**8. `loggerProvider` must provide `LOGGING_BEHAVIOR_LOGGER`.** The option was any NestJS
`Provider`; it is now `PipelineLoggerProvider`, whose `provide` must be that token:

```typescript
// 0.1.x
PipelineModule.forRoot({ loggerProvider: { provide: 'LOGGER', useClass: PinoLogger } });

// 0.2.0
import { LOGGING_BEHAVIOR_LOGGER } from '@nestjs-pipeline/core';
PipelineModule.forRoot({
  loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useClass: PinoLogger },
});
```

**9. A behavior without an explicit id is identified by its class.** `getBehaviorId()`
returns the class, not `cls.name`, and `PIPELINE_BEHAVIOR_ID` is a `Symbol.for` value. Code
that compared ids to strings must compare classes, or set an explicit id:

```typescript
// 0.1.x
if (getBehaviorId(entry) === 'AuditBehavior') { /* ... */ }

// 0.2.0
if (getBehaviorId(entry) === AuditBehavior) { /* ... */ }
```

**10. `LoggingBehavior` masks sensitive fields by default.** Keys such as `password`, `token`
and `refreshToken` (case, `_` and `-` ignored) are logged as `[REDACTED]`. To keep the 0.1.x
output for a handler:

```typescript
@UsePipeline([LoggingBehavior, { redactSensitiveKeys: false }])
```

**11. `@nestjs-pipeline/zod`: `ZOD_SCHEMA` is removed** (it was a deprecated alias), and `zod`
must be `^4.3.0`.

```typescript
// 0.1.x
static readonly [ZOD_SCHEMA] = userCreatedSchema;
// 0.2.0
static readonly [ZOD_SCHEMA_KEY] = userCreatedSchema;
```

**12. `ZodValidationBehavior` applies the parsed output to the request.** In 0.1.x it only
validated. It now parses asynchronously (`safeParseAsync`), deletes keys the schema strips,
and assigns coerced and defaulted values to the request before the handler runs. A schema
whose top-level output is not a plain object (an array, a primitive, a `Date`) is rejected
with a `TypeError`. A handler that read unknown or raw fields must declare them in the
schema. A class built with `createCommand()` or `createQuery()` keeps its original input:

```typescript
// 0.2.0
import { getRawInput } from '@nestjs-pipeline/zod';
const raw = getRawInput(command);
```

**13. `@nestjs-pipeline/casl`: one permission source replaces the providers.**
The module options `roleProvider`, `userCapabilityProvider`, `userContextResolver`,
`subjectContextPaths` and `defaultFieldsFromRequest` are removed, and `@casl/ability` must be
`^7.0.0`. The `CaslBehavior` options `subjectFromRequest`, `subjectContextPaths`,
`fieldsFromRequest`, `skipCheck` and `prebuiltAbility` are removed, and `rules` is required
and non-empty. The provider tokens (`CASL_ROLE_PROVIDER`, `CASL_USER_CAPABILITY_PROVIDER`,
`CASL_USER_CONTEXT_RESOLVER`, …), `StaticRoleProvider` and `buildAbilityFromRules` are removed,
and `buildAbility(roles, user, …)` becomes `buildAbility(rules, principal)`. Implement
`ICaslPermissionSource`, whose `load()` returns the caller and their rules, and check
entities and fields in the handler with `CaslAuthorizer`:

```typescript
// 0.1.x
CaslModule.forRoot({
  roleProvider: { useFactory: () => roleProvider },
  subjectContextPaths: ['sessionUser'],
  userCapabilityProvider: DatabaseUserCapabilityProvider,
});

@UsePipeline([CaslBehavior, { rules: [{ action: 'create', subject: 'Post' }] }])

// 0.2.0
@Injectable()
export class AppPermissionSource implements ICaslPermissionSource {
  constructor(private readonly grants: GrantRepository) {}

  async load(): Promise<CaslAuthorizationInput | null> {
    const session = currentSession();
    if (!session) return null; // unauthenticated: every gated handler is denied
    return {
      principal: { id: session.userId },
      rules: await this.grants.rulesFor(session.userId),
    };
  }
}

CaslModule.forRoot({
  imports: [AuthorizationModule],
  permissionSource: { useExisting: AppPermissionSource },
});

@UsePipeline(requires({ action: 'create', subject: 'Post' }))
```

**14. A CASL denial throws `UnauthorizedActionException`, not `ForbiddenException`.** It
extends `Error`, so without its filter NestJS answers HTTP 500. Register the filter to keep
the 403:

```typescript
import { APP_FILTER } from '@nestjs/core';
import { UnauthorizedActionFilter } from '@nestjs-pipeline/casl';

@Module({
  providers: [{ provide: APP_FILTER, useClass: UnauthorizedActionFilter }],
})
export class AppModule {}
```

Each package README has a full migration section:
[core](packages/pipeline/README.md#migrating-from-01x),
[correlation](packages/pipeline-correlation/README.md#migrating-from-01x),
[opentelemetry](packages/pipeline-opentelemetry/README.md#migrating-from-01x),
[zod](packages/pipeline-zod/README.md#migrating-from-01x),
[casl](packages/pipeline-casl/README.md#migrating-from-01x),
[uuidv7](packages/uuidv7/README.md#migrating-from-01x),
[untyped](packages/untyped/README.md#migrating-from-01x) and
[safe-stringify](packages/safe-stringify/README.md#migrating-from-01x).

---

## Quick Start

### 1. Install

Requires **Node.js 22.12** or later, **Nest 12.1** or a later 12.x (`@nestjs/common`,
`@nestjs/core`) and **`@nestjs/cqrs` 12.1** or a later 12.x. Nest 12.0.x drops the `@Optional()` markers of a
base class in a subclass that declares no constructor of its own.

```bash
pnpm add @nestjs-pipeline/core @nestjs/common @nestjs/core @nestjs/cqrs reflect-metadata rxjs

# Optional add-ons
pnpm add @nestjs-pipeline/correlation   # HTTP correlation middleware, @WithCorrelation, etc.
pnpm add @nestjs-pipeline/zod zod
pnpm add @nestjs-pipeline/opentelemetry @opentelemetry/api
pnpm add @nestjs-pipeline/casl @casl/ability      # ABAC authorization with CASL
pnpm add @nestjs-pipeline/resilience cockatiel    # retry, circuit breaker, timeout, bulkhead, fallback
pnpm add @nestjs-pipeline/cache cache-manager keyv  # read-through query caching (+ optional @keyv/redis, @keyv/postgres, ...)
pnpm add @nestjs-pipeline/deadletter bullmq        # dead-letter failed requests (or amqplib / pg as a drop-in)
pnpm add @nestjs-pipeline/rate-limit rate-limiter-flexible  # rate limiting (memory, Redis/Valkey, Mongo, SQL backends)
pnpm add @nestjs-pipeline/audit   # audit trail (console default; + optional pg for Postgres)
pnpm add @nestjs-pipeline/idempotency   # idempotent commands (in-memory default; + optional redis/pg)
pnpm add @nestjs-pipeline/feature-flags @openfeature/server-sdk  # feature flags (provider adapters optional)
pnpm add @nestjs-pipeline/tenant   # currentTenantId(): the running pipeline's tenant
pnpm add @nestjs-pipeline/job-context   # a request's tenant, correlation id and principal in its queue jobs

# Optional: pino logger integration
pnpm add nestjs-pino pino-http pino-pretty
```

### 2. Register the Module

```typescript
// app.module.ts
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule, LoggingBehavior } from '@nestjs-pipeline/core';
import {
  correlationSource,
  HttpCorrelationMiddleware,
} from '@nestjs-pipeline/correlation';
import { tenantSource } from '@nestjs-pipeline/tenant';
import { ZodValidationBehavior, zodBadRequest } from '@nestjs-pipeline/zod';
import { TraceBehavior } from '@nestjs-pipeline/opentelemetry';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      // Where each pipeline takes its tenant and correlation id from.
      sources: { tenantId: tenantSource, correlationId: correlationSource },
      globalBehaviors: {
        scope: 'all',                // 'commands' | 'queries' | 'events' | 'all'
        before: [
          LoggingBehavior,          // outermost; may observe raw input
          ZodValidationBehavior,     // normalizes before handler policies
        ],
        after: [                     // runs closest to the handler
          [TraceBehavior, { tracerName: 'my-service' }],
        ],
      },
    }),
  ],
  providers: [
    // Validates route parameters declared with `{ schema }` (step 5).
    {
      provide: APP_PIPE,
      useValue: new StandardSchemaValidationPipe({ exceptionFactory: zodBadRequest }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
  }
}
```

Without `sources`, pipelines have no tenant and generate their own correlation id, and
bootstrap logs a warning; pass `sources: {}` to run without them on purpose.

### 3. Define a Command with Zod Validation

```typescript
// create-user.command.ts
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

// 1. Define the schema
const schema = z.object({
  username: z.string().min(4),
  email: z.email(),
});

// 2. Create the command — fully typed, self-validating, Standard Schema compatible
export class CreateUserCommand extends createCommand(schema) {}

// Usage:
// const cmd = new CreateUserCommand({ username: 'jane', email: 'jane@example.com' });
// cmd.username → 'jane'
// cmd.email    → 'jane@example.com'
// new CreateUserCommand({ username: 'ab', email: 'bad' }) → throws ZodValidationError
```

### 4. Write the Handler

```typescript
// create-user.handler.ts
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline, LoggingBehavior } from '@nestjs-pipeline/core';
import { CreateUserCommand } from './create-user.command';

@CommandHandler(CreateUserCommand)
@UsePipeline(
  // Override global LoggingBehavior options for this handler only
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateUserCommand): Promise<User> {
    const user = User.create(command.username, command.email);
    await this.userRepository.save(user);

    this.eventBus.publish(
      new UserCreatedEvent({
        userId: user.id,
        username: user.username,
        email: user.email,
      }),
    );

    return user;
  }
}
```

This constructor helper is intentionally synchronous and therefore requires a
synchronous schema. For a schema with async refinements or transforms, build the
instance with the generated `parseAsync()` static instead — the behavior and the
pipe both run *after* construction, so they cannot rescue a constructor that
cannot complete:

```typescript
const command = await CreateUserCommand.parseAsync({ email, age });
```

You can also validate raw input up front, asynchronously, in
`ZodValidationBehavior` or in Nest's schema validation pipe rather than doing it
in a JavaScript constructor.

### 5. Wire Up the Controller

```typescript
// users.controller.ts
import { Body, Controller, Get, Param, Post, HttpCode } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';

const CreateUserDtoSchema = z.object({ name: z.string().min(5), email: z.email() });
type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

const UserIdSchema = z.uuid();

@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(201)
  async createUser(
    @Body({ schema: CreateUserDtoSchema }) dto: CreateUserDto,
  ) {
    return this.commandBus.execute(
      new CreateUserCommand({ username: dto.name, email: dto.email }),
    );
  }

  @Get(':id')
  async getUser(
    @Param('id', { schema: UserIdSchema }) id: string,
  ) {
    return this.queryBus.execute(new GetUserQuery({ userId: id }));
  }
}
```

### 6. Bootstrap the Application

```typescript
// main.ts
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // maps ZodValidationError → HTTP 400, replying through Nest's HTTP adapter
  app.useGlobalFilters(new ZodValidationFilter(app.get(HttpAdapterHost)));
  await app.listen(3000);
}
bootstrap();
```

---

## Writing Custom Behaviors

Every behavior implements the `IPipelineBehavior` interface — a single `handle(context, next)` method:

```typescript
import { Injectable } from '@nestjs/common';
import {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@nestjs-pipeline/core';

@Injectable()
export class MyBehavior implements IPipelineBehavior {
  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<any> {
    // ── BEFORE the handler ──
    // Access context.request, context.correlationId, context.requestKind, etc.

    const result = await next(); // call the next behavior in the chain (or the handler)

    // ── AFTER the handler ──
    // Access context.response (set automatically after the handler returns)

    return result;
  }
}
```

### Example: Metrics Behavior

> **Tip:** A production-ready metrics behavior already ships in [`@nestjs-pipeline/opentelemetry`](packages/pipeline-opentelemetry) (`MetricsBehavior`, built on the OTel Metrics API). The example below is a from-scratch illustration for any custom metrics backend.

```typescript
import { Injectable } from '@nestjs/common';
import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';

@Injectable()
export class MetricsBehavior implements IPipelineBehavior {
  constructor(private readonly metricsService: MetricsService) {}

  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    const start = performance.now();
    const labels = {
      kind: context.requestKind,     // 'command' | 'query' | 'event'
      name: context.requestName,     // 'CreateUserCommand'
      handler: context.handlerName,  // 'CreateUserHandler'
    };

    try {
      const result = await next();
      const durationMs = performance.now() - start;
      this.metricsService.recordDuration('pipeline.duration_ms', durationMs, labels);
      this.metricsService.incrementCounter('pipeline.success', labels);
      return result;
    } catch (error) {
      const durationMs = performance.now() - start;
      this.metricsService.recordDuration('pipeline.duration_ms', durationMs, labels);
      this.metricsService.incrementCounter('pipeline.failure', labels);
      throw error;
    }
  }
}
```

### Example: Audit-Trail Behavior with Options

Pass per-handler options via the `[Behavior, { ... }]` tuple form and read them with `getBehaviorOptions()`:

```typescript
// audit.behavior.ts
import { Injectable } from '@nestjs/common';
import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';

export interface AuditOptions {
  action: string;
  severity?: 'low' | 'medium' | 'high';
}

@Injectable()
export class AuditBehavior implements IPipelineBehavior {
  constructor(private readonly auditService: AuditService) {}

  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    const result = await next();

    // Read handler-specific options from @UsePipeline([AuditBehavior, { ... }])
    const opts = context.getBehaviorOptions<AuditOptions>(AuditBehavior);
    if (opts) {
      await this.auditService.log({
        action: opts.action,
        severity: opts.severity ?? 'medium',
        correlationId: context.correlationId,
        requestKind: context.requestKind,
        requestName: context.requestName,
        handler: context.handlerName,
        timestamp: context.startedAt,
        payload: context.request,
      });
    }

    return result;
  }
}

// create-user.handler.ts — handler-level options
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [AuditBehavior, { action: 'user.create', severity: 'high' }],
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand): Promise<User> { /* ... */ }
}

// delete-order.handler.ts — different options for a different handler
@CommandHandler(DeleteOrderCommand)
@UsePipeline(
  [AuditBehavior, { action: 'order.delete', severity: 'high' }],
)
export class DeleteOrderHandler implements ICommandHandler<DeleteOrderCommand> {
  async execute(command: DeleteOrderCommand): Promise<void> { /* ... */ }
}
```

### Example: Caching Behavior

A minimal illustration only: its key has no tenant, principal or permission scope, so it
can serve one caller's response to another. Use `@nestjs-pipeline/cache` with
`createPartitionedCacheKeyFactory` for real handlers.

```typescript
import { Injectable } from '@nestjs/common';
import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';

@Injectable()
export class CachingBehavior implements IPipelineBehavior {
  constructor(private readonly cache: CacheService) {}

  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    // Only cache queries — commands and events always execute
    if (context.requestKind !== 'query') {
      return next();
    }

    const cacheKey = `${context.requestName}:${JSON.stringify(context.request)}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await next();
    await this.cache.set(cacheKey, result, { ttl: 60 });
    return result;
  }
}
```

### Example: Retry Behavior

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';

@Injectable()
export class RetryBehavior implements IPipelineBehavior {
  private readonly logger = new Logger(RetryBehavior.name);

  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    const maxRetries = 3;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await next();
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `[${context.correlationId}] ${context.requestName} ` +
          `attempt ${attempt}/${maxRetries} failed: ${lastError.message}`,
        );
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 100 * attempt));
        }
      }
    }

    throw lastError!;
  }
}
```

### Registering Behaviors

```typescript
// ── Global: auto-wraps all commands, queries, and events ──
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [MetricsBehavior, LoggingBehavior, ZodValidationBehavior],
  },
})

// ── Scoped global: only commands ──
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'commands',
    before: [AuditBehavior],
  },
})

// ── Per-kind scoping with array form ──
PipelineModule.forRoot({
  globalBehaviors: [
    { scope: 'commands', before: [AuditBehavior] },
    { scope: 'queries',  before: [CachingBehavior] },
    { scope: 'all',      after:  [LoggingBehavior] },
  ],
})

// ── Per-handler: override or add behaviors for specific handlers ──
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [AuditBehavior, { action: 'user.create' }],
)
export class CreateUserHandler { /* ... */ }

// ── Feature module: register feature-owned behaviors application-wide ──
@Module({
  imports: [PipelineModule.forFeature([AuditBehavior, CachingBehavior])],
})
export class AuditModule {}
```

`PipelineModule` is global, so `forFeature()` records where behavior providers
are owned but does not isolate them to that feature's module hierarchy. Once the
feature is imported, the registered behaviors are discoverable by
`@UsePipeline()` throughout the application.

---

## Pipeline Execution Model

```
┌─ global before ──┐   ┌── @UsePipeline ──┐   ┌─ global after ──┐
│ LoggingBehavior  │ → │ AuditBehavior    │ → │ TraceBehavior   │ → handler.execute()
│ ZodValidation    │   │                  │   │ MetricsBehavior │
└──────────────────┘   └──────────────────┘   └─────────────────┘
                    ← response propagates back through the chain ←
```

1. At startup the pipeline finds the CQRS handlers through Nest's `DiscoveryService`, by the metadata their `@CommandHandler`, `@QueryHandler` and `@EventsHandler` decorators record.
2. For each matching handler it precomputes request-independent metadata and resolves singleton behavior instances. Behaviors that cannot be resolved as singletons are marked for per-invocation resolution.
3. Per invocation: creates a `PipelineContext`, resolves any dynamic/request-scoped/transient behaviors with the applicable Nest context ID, takes the tenant and correlation id from the configured `sources`, and runs the chain inside them (and `AsyncLocalStorage`) so nested dispatches inherit them.
4. The common all-singleton path reuses the pre-resolved instances with no request-time reflection or behavior DI lookup; scoped/dynamic behaviors intentionally use request-time DI resolution.
5. Requires Nest and Nest CQRS 12. Request-scoped and transient handlers
   (`Scope.REQUEST`, `Scope.TRANSIENT`) rely on `AsyncContext`, which earlier
   CQRS versions do not provide.

### Execution Order

| Phase | Source | Position |
|---|---|---|
| Global `before` | `globalBehaviors.before` | Outermost (first to run) |
| Handler-level | `@UsePipeline(...)` | Middle |
| Global `after` | `globalBehaviors.after` | Innermost (closest to handler) |
| Handler | `execute()` / `handle()` | Core |

### Deduplication

When both global and handler-level configurations include the same behavior
class, the handler's complete options record wins while the behavior retains
its global chain position. Global duplicates are deduplicated automatically.

```typescript
// Global config
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [LoggingBehavior], // default options: metricLogLevel='log', requestResponseLogLevel='debug'
  },
})

// Handler overrides LoggingBehavior's options
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }], // ← wins over the global entry
)
export class CreateUserHandler { /* ... */ }

// Effective chain for CreateUserHandler:
//   [LoggingBehavior at global-before position, using handler opts] → handler
```

Configure mandatory authentication/authorization behaviors in global `before`.
Core preserves that outer position even when a handler redeclares the behavior
to provide rules or other options, preventing inner cache/idempotency hits from
bypassing the guard.

---

## Correlation IDs

`@nestjs-pipeline/correlation` and `@nestjs-pipeline/tenant` each keep their value in
their own store and depend on no other pipeline package. Pass their stores to
`PipelineModule.forRoot({ sources: { tenantId: tenantSource, correlationId: correlationSource } })`,
and a pipeline takes both when it starts: `context.correlationId` is the current ID or a new
one from `correlationSource.create()`, and `context.tenantId` is the current tenant
(write-once). The behaviors and
handler run inside both values, so a saga, an event published with `eventBus.publish()` or a nested
`CommandBus.execute()` inherits them, and `getCorrelationId()` in a handler equals
`context.correlationId`. Set the values where work enters, with `HttpCorrelationMiddleware` or `runWithCorrelationId` of
`@nestjs-pipeline/correlation` and `runWithTenant` of `@nestjs-pipeline/tenant`.

### HTTP Requests

Install `@nestjs-pipeline/correlation` and apply `HttpCorrelationMiddleware` to extract correlation IDs from HTTP headers:

```typescript
import { HttpCorrelationMiddleware } from '@nestjs-pipeline/correlation';

@Module({ /* ... */ })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
  }
}
```

Then send the header:

```bash
curl -X POST http://localhost:3000/users \
  -H 'x-correlation-id: req-abc-123' \
  -H 'Content-Type: application/json' \
  -d '{"name": "Jane", "email": "jane@example.com"}'
```

The pipeline `context.correlationId` will be `"req-abc-123"` for the entire chain. If the header is omitted or malformed (over 128 characters, or characters outside `DEFAULT_CORRELATION_ID_PATTERN`), a new ID is generated.

### Bull Queue Processor

```typescript
import { runWithCorrelationId } from '@nestjs-pipeline/correlation';
import { Process, Processor } from '@nestjs/bull';

@Processor('email-queue')
export class EmailProcessor {
  constructor(private readonly commandBus: CommandBus) {}

  @Process('send-email')
  async handleSendEmail(job: Job) {
    return runWithCorrelationId(job.data.correlationId, async () => {
      await this.commandBus.execute(new SendEmailCommand(job.data));
    });
  }
}
```

### RabbitMQ Handler

```typescript
import { runWithCorrelationId } from '@nestjs-pipeline/correlation';

@MessagePattern('user.created')
async handle(@Payload() data: UserPayload, @Ctx() ctx: RmqContext) {
  const correlationId = ctx.getMessage().properties.correlationId;

  return runWithCorrelationId(correlationId, () =>
    this.commandBus.execute(new SyncUserCommand(data)),
  );
}
```

### Cron Jobs

```typescript
import { uuidv7 } from '@cqrs-ddd/uuidv7';
import { runWithCorrelationId } from '@nestjs-pipeline/correlation';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class SyncScheduler {
  constructor(private readonly commandBus: CommandBus) {}

  @Cron('0 * * * *')
  async hourlySync() {
    return runWithCorrelationId(uuidv7(), () =>
      this.commandBus.execute(new SyncAllUsersCommand()),
    );
  }
}
```

### Nested Commands (Sagas)

Sagas do **not** need `@UsePipeline`. Commands emitted by a saga flow through the `CommandBus` and hit the target handler's pipeline automatically. The child pipeline inherits the parent's `correlationId` and `tenantId` via `AsyncLocalStorage`:

```typescript
// Saga — no @UsePipeline needed
@Injectable()
export class OrderSagas {
  @Saga()
  orderCreated = (events$: Observable<any>): Observable<ICommand> =>
    events$.pipe(
      ofType(OrderCreatedEvent),
      map((event) => new SendOrderConfirmationCommand({ orderId: event.orderId })),
      // ↑ This command inherits correlationId & tenantId from the parent pipeline context
    );
}
```

### @WithCorrelation Decorator

Instead of manually calling `runWithCorrelationId`, use the `@WithCorrelation()` method decorator for a cleaner approach. It wraps the method body in a correlation context automatically:

```typescript
import { WithCorrelation, CorrelationFrom, getCorrelationId } from '@nestjs-pipeline/correlation';

// ── Bull (reads from job.data.correlationId by default) ──
@Process('send-email')
@WithCorrelation()
async handleSendEmail(job: Job) {
  const id = getCorrelationId(); // available anywhere in the call stack
  await this.commandBus.execute(new SendEmailCommand(job.data));
}

// ── RabbitMQ (AMQP properties) ──
@MessagePattern('user.created')
@WithCorrelation(CorrelationFrom.amqp())
async handle(@Payload() data: any, @Ctx() ctx: RmqContext) {
  await this.commandBus.execute(new SyncUserCommand(data));
}

// ── Kafka (message headers) ──
@EventPattern('order.placed')
@WithCorrelation(CorrelationFrom.kafka())
async handle(@Payload() data: any, @Ctx() ctx: KafkaContext) {
  await this.commandBus.execute(new ProcessOrderCommand(data));
}

// ── NATS ──
@MessagePattern('user.created')
@WithCorrelation(CorrelationFrom.nats())
async handle(@Payload() data: any, @Ctx() ctx: NatsContext) { }

// ── gRPC ──
@GrpcMethod('UsersService', 'FindOne')
@WithCorrelation(CorrelationFrom.grpc())
async findOne(data: any, metadata: Metadata) { }

// ── Cron (no ID in args → auto-generates uuidv7) ──
@Cron('0 * * * *')
@WithCorrelation()
async hourlySync() {
  await this.commandBus.execute(new SyncCommand());
}
```

### Producer-Side: Stamping Correlation IDs

When enqueuing jobs or publishing messages, stamp the current correlation ID onto the payload or headers:

```typescript
import { addCorrelationId, correlationHeaders, getCorrelationId } from '@nestjs-pipeline/correlation';

// ── Bull / BullMQ (data payload) ──
await queue.add('send-email', addCorrelationId({ userId, email }));
// → { userId, email, correlationId: '019728a3-...' }

// ── Kafka (message headers) ──
await producer.send({
  topic: 'orders',
  messages: [{ value: JSON.stringify(order), headers: correlationHeaders() }],
});
// → headers: { 'x-correlation-id': '019728a3-...' }

// ── HTTP (outgoing request) ──
await fetch(url, { headers: { ...correlationHeaders(), 'content-type': 'application/json' } });

// ── Read the current ID anywhere ──
const id = getCorrelationId(); // the current ID, or a new one when none is set
```

---

## Pipeline Context Reference

### Properties

Every behavior receives `IPipelineContext`:

| Property | Type | Description |
|---|---|---|
| `correlationId` | `string` | Immutable ID fixed before the behavior chain starts |
| `tenantId` | `string \| undefined` | Current tenant when the pipeline started; write-once |
| `request` | `TRequest` | The command / query / event instance |
| `requestType` | `Type<TRequest>` | Class constructor (e.g. `CreateUserCommand`) |
| `requestName` | `string` | Class name string (e.g. `"CreateUserCommand"`) |
| `handlerType` | `Type` | Handler class constructor |
| `handlerName` | `string` | Handler class name (e.g. `"CreateUserHandler"`) |
| `requestKind` | `'command' \| 'query' \| 'event' \| 'unknown'` | Auto-detected from `@nestjs/cqrs` metadata |
| `startedAt` | `Date` | UTC timestamp of pipeline start |
| `response` | `TResponse \| undefined` | Set after `next()` returns; `undefined` before handler runs |
| `items` | `Map<string \| symbol, unknown>` | Shared bag for inter-behavior communication |

### Using `items` for Inter-Behavior Communication

```typescript
// AuthBehavior — runs before other behaviors
@Injectable()
export class AuthBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    const userId = await this.authService.getCurrentUserId();
    context.items.set('currentUserId', userId);  // ← store data
    return next();
  }
}

// AuditBehavior — runs after AuthBehavior in the chain
@Injectable()
export class AuditBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    const result = await next();
    const userId = context.items.get('currentUserId');  // ← read data
    await this.auditService.log({
      action: context.requestName,
      userId,
      correlationId: context.correlationId,
    });
    return result;
  }
}
```

### Behavior Options

Pass per-handler options with the `[Behavior, { ... }]` tuple form and read them with `getBehaviorOptions()`:

```typescript
// Handler declaration
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [AuditBehavior, { action: 'user.create', severity: 'high' }],
  [LoggingBehavior, { metricLogLevel: 'verbose', requestResponseLogLevel: 'log' }],
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  /* ... */
}

// Inside AuditBehavior
async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
  const opts = context.getBehaviorOptions<AuditOptions>(AuditBehavior);
  // opts → { action: 'user.create', severity: 'high' }
  // ...
}
```

Options can also be set at the global level:

```typescript
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [
      [LoggingBehavior, { metricLogLevel: 'log', requestResponseLogLevel: 'debug' }],
    ],
    after: [
      [TraceBehavior, { tracerName: 'my-service' }],
    ],
  },
})
```

When the same behavior has options at both global and handler level, the handler
entry replaces its **whole options record** while the behavior retains its
global chain position. The core does not shallow-merge individual properties
inside those two records.

---

## Built-in LoggingBehavior

The core package ships with `LoggingBehavior` that logs request/response data and timing metrics via the NestJS `Logger`:

```typescript
import { LoggingBehavior } from '@nestjs-pipeline/core';

// Register globally with default options
PipelineModule.forRoot({
  globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
})
```

**Options** (`LoggingBehaviorOptions`):

| Option | Type | Default | Description |
|---|---|---|---|
| `metricLogLevel` | `LogLevel \| 'none'` | `'log'` | Log level for timing/duration messages |
| `requestResponseLogLevel` | `LogLevel \| 'none'` | `'debug'` | Log level for request/response payloads |
| `errorLogLevel` | `LogLevel \| 'none'` | `'error'` | Log level when an error happened |
| `mapLogLevel` | `Map<ErrorClass, LogLevel \| 'none'>` | `undefined` | Specific log levels mapped by exception error class (most specific match in prototype chain wins) |
| `excludeKeys` | `string[]` | `[]` | Keys to omit from request/response logs (supports dot notation for nested properties) |
| `excludeRequestObj` | `boolean` | `true` | If true, omits the request object from logs entirely (shows placeholder instead) |
| `excludeResponseObj` | `boolean` | `true` | If true, omits the response object from logs entirely (shows placeholder instead) |
| `logFormat` | `'text' \| 'structured'` | `'text'` | Output shape for request/response/metric/error logs. `'text'` produces a single interpolated string; `'structured'` produces a plain object (e.g. `{ msg, request }`), useful for structured loggers like `nestjs-pino`/pino that serialize to JSON |

> By default `excludeRequestObj`/`excludeResponseObj` are `true`, so out of the box you'll see the placeholders `[exclude request obj]` / `[exclude response obj]` rather than the actual payload — set them to `false` to log the real request/response.

On failure, the error log also includes the thrown error's `stack` (when it's an `Error` instance) and, if the error exposes an `optionalParams` property (e.g. a custom exception carrying extra structured context), those values are appended to the log entry as well.

To provide your own logger implementation (for example `nestjs-pino`), bind the `LOGGING_BEHAVIOR_LOGGER` token:

```typescript
import { Module } from '@nestjs/common';
import { NativeLogger } from 'nestjs-pino';
import {
  LOGGING_BEHAVIOR_LOGGER,
  LoggingBehavior,
  PipelineModule,
} from '@nestjs-pipeline/core';

@Module({
  imports: [
    PipelineModule.forRoot({
      globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
      bootstrapLogLevel: 'verbose',
    }),
  ],
  providers: [
    { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: NativeLogger },
  ],
})
export class AppModule {}
```

When using `nestjs-pino`, Nest log levels map to pino as:
`verbose` → `trace`, `debug` → `debug`, `log` → `info`, `warn` → `warn`, `error` → `error`, `fatal` → `fatal`.
If you use `bootstrapLogLevel: 'verbose'`, set pino `level: 'trace'`.

```typescript
// Verbose logging for a specific handler
@CommandHandler(CreateUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class CreateUserHandler { /* ... */ }

// Map specific exceptions to different log levels (e.g. log constraint violations as warnings)
@UsePipeline([LoggingBehavior, { 
  mapLogLevel: new Map([
    [UniqueConstraintException, 'warn'],
    [NotFoundException, 'debug'],
  ]) 
}])

// Disable payload logging entirely, keep timing metrics
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'none' }])

// Disable all logging for a handler
@UsePipeline([LoggingBehavior, { metricLogLevel: 'none', requestResponseLogLevel: 'none' }])
```

`LoggingBehavior` logs under the **handler's** context, not its own. The handler name is passed with each log call, so a singleton logger is never mutated and concurrent handlers cannot overwrite one another's context. With `excludeRequestObj: false, excludeResponseObj: false`:

**Output example** (on success):

```
[Nest] LOG   [CreateUserHandler] Request: {"username":"jane","email":"jane@example.com"}
[Nest] LOG   [CreateUserHandler] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler completed in 12.34ms
[Nest] DEBUG [CreateUserHandler] Response: {"id":"...","username":"jane","email":"jane@example.com"}
```

**Output example** (on error):

```
[Nest] ERROR [CreateUserHandler] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler failed after 2.10ms: Error: User already exists
```

---

## Zod Integration (`@nestjs-pipeline/zod`)

Comprehensive Zod v4 integration at every layer of a NestJS CQRS application.

### Pipeline-Level Validation

Register `ZodValidationBehavior` globally. It parses any request class that has a
static `_zodSchema` property (set automatically by `createCommand()`, `createQuery()`, or `createZodRequest()`):

```typescript
// app.module.ts
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [ZodValidationBehavior], // normalizes before per-handler behaviors
  },
})

// create-user.command.ts
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const schema = z.object({
  username: z.string().min(4),
  email: z.email(),
});

// Generates a self-validating class with static _zodSchema,
// Standard Schema (~standard) metadata, and static parse()/safeParse().
// This repository supports and tests NestJS 12.1.
export class CreateUserCommand extends createCommand(schema) {}
//                                       ↑ attaches schema as static _zodSchema, sets requestKind: 'command'
```

If parsing fails, `ZodValidationBehavior` throws a `ZodValidationError` with
structured details from `ZodError.flatten()`. On successful object output, it
updates the existing request object to match the parsed data before the next
behavior/handler runs: keys omitted by the parsed result are removed and parsed,
coerced, transformed, or defaulted values are assigned to that same request.
The behavior uses Zod's async parser, so asynchronous refinements and
transforms are supported.

### Controller-Level Validation

Declare a Zod schema on `@Body()`, `@Param()` or `@Query()` with `{ schema }`; Nest's
`StandardSchemaValidationPipe`, registered once with `zodBadRequest` as its
`exceptionFactory` (see [Register the Module](#2-register-the-module)), validates it,
awaits asynchronous refinements and transforms, and hands the handler the schema output.
A failure answers HTTP 400 with `{ formErrors, fieldErrors }`:

```typescript
import { z } from 'zod';

// Simple schemas
const CreateUserDtoSchema = z.object({
  email: z.email(),
  name: z.string().min(5),
});
type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

const UserIdSchema = z.uuid();

@Controller('users')
export class UsersController {
  // Validate request body
  @Post()
  createUser(@Body({ schema: CreateUserDtoSchema }) dto: CreateUserDto) {
    return this.commandBus.execute(new CreateUserCommand(dto));
  }

  // Validate route param (UUID format)
  @Get(':id')
  getUser(@Param('id', { schema: UserIdSchema }) id: string) {
    return this.queryBus.execute(new GetUserQuery({ userId: id }));
  }

  // Validate + transform body
  @Patch(':id')
  updateUser(
    @Param('id', { schema: UserIdSchema }) id: string,
    @Body({ schema: UpdateUserDtoSchema }) dto: UpdateUserDto,
  ) {
    return this.commandBus.execute(UpdateUserMapper.map(id, dto));
  }
}
```

### Zod Transform Mappers (DTO → Command)

Use Zod transforms to map DTOs to commands in a single step:

```typescript
// create-user.mapper.ts
import { BadRequestException } from '@nestjs/common';
import { CreateUserDtoSchema } from '../dtos/create-user.dto';
import { CreateUserCommand } from '../cqrs/commands/create-user.command';

// Schema that validates a DTO and transforms it into a command
const CreateUserMapperSchema = CreateUserDtoSchema.transform(
  ({ name, email }) => new CreateUserCommand({ username: name, email }),
);

export const CreateUserMapper = {
  map(input: CreateUserDto): CreateUserCommand {
    const result = CreateUserMapperSchema.safeParse(input);
    if (!result.success) throw new BadRequestException(result.error.flatten());
    return result.data;
  },
};

// Usage in controller
@Post()
createUser(@Body({ schema: CreateUserDtoSchema }) dto: CreateUserDto) {
  return this.commandBus.execute(CreateUserMapper.map(dto));
}
```

### Error Handling with ZodValidationFilter

Register `ZodValidationFilter` as a global exception filter to catch `ZodValidationError` and return a structured HTTP 400 response. It replies through Nest's HTTP adapter, so register it as a provider, where Nest injects the adapter host:

```typescript
// app.module.ts
import { APP_FILTER } from '@nestjs/core';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';

@Module({
  providers: [{ provide: APP_FILTER, useClass: ZodValidationFilter }],
})
export class AppModule {}
```

The bundled filters of `@nestjs-pipeline/casl`, `/feature-flags`, `/idempotency` and
`/rate-limit` register the same way.

**Response format** (HTTP 400):

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "email": ["Invalid email"],
      "username": ["String must contain at least 4 character(s)"]
    }
  }
}
```

### Attaching Schemas to Plain Event Classes

Event classes that don't use `createZodRequest()` can still be parsed/validated by attaching the schema manually:

```typescript
import { ZOD_SCHEMA_KEY } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const userCreatedSchema = z.object({
  userId: z.uuid(),
  username: z.string().min(1),
  email: z.email(),
});

export class UserCreatedEvent {
  static readonly [ZOD_SCHEMA_KEY] = userCreatedSchema;

  constructor(
    public readonly userId: string,
    public readonly username: string,
    public readonly email: string,
  ) {}
}
```

---

## OpenTelemetry Integration (`@nestjs-pipeline/opentelemetry`)

Auto-creates **spans** (`TraceBehavior`) and records **metrics** (`MetricsBehavior`) for every pipeline invocation with full context attributes.

### Setup

```typescript
// tracing.ts — MUST be imported before NestFactory.create()
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const sdk = new NodeSDK({
  serviceName: 'users-api',
  traceExporter: new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces' }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: 'http://localhost:4318/v1/metrics' }),
  }),
});
sdk.start();

// main.ts
import './tracing'; // ← MUST be the first import
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// app.module.ts
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    after: [
      [TraceBehavior, { tracerName: 'users-api' }],
      [MetricsBehavior, { meterName: 'users-api' }],
    ],
  },
})
```

### Span Details

Each span includes:

| Field | Example |
|---|---|
| **Span name** | `command.CreateUserCommand` |
| `pipeline.request.kind` | `command` |
| `pipeline.request.name` | `CreateUserCommand` |
| `pipeline.handler.name` | `CreateUserHandler` |
| `pipeline.correlation_id` | `019728a3-...` |
| `pipeline.started_at` | `2026-03-01T12:00:00.000Z` |
| **Status** | `OK` on success, `ERROR` with recorded exception |

### Metrics

`MetricsBehavior` records two instruments via the OTel **Metrics API** — derive throughput, error-rate, and latency percentiles per handler:

| Instrument | Type | Unit | Attributes |
|---|---|---|---|
| `pipeline.handler.duration` | Histogram | `ms` | `pipeline.request.kind/name`, `pipeline.handler.name`, `outcome` |
| `pipeline.handler.invocations` | Counter | — | + `error.type` on failures |

Metric attributes are intentionally **low-cardinality** (no `correlation_id`/`started_at`, which would explode time-series count — those live on spans).

### No SDK? No Problem.

If the OpenTelemetry SDK is not initialized, both behaviors remain safe:
`TraceBehavior` passes through without spans, while `MetricsBehavior` still does
its normal timing and metric-recording calls against a no-op meter, so recordings
are discarded. Telemetry unavailability does not make either behavior throw, but
the metrics path is not a literal zero-overhead path. A warning is logged once at
startup:

```
[Nest] WARN [TraceBehavior] OpenTelemetry SDK is NOT initialized — TraceBehavior will pass through without tracing.
[Nest] WARN [MetricsBehavior] OpenTelemetry metrics SDK is NOT initialized — MetricsBehavior will record to a no-op meter (metrics discarded).
```

---

## DDD Example

`packages/ddd-core` and the `api` example demonstrate Domain-Driven Design with `@nestjs-pipeline`.

### `packages/ddd-core` — framework-neutral DDD support

The `@cqrs-ddd/core` package has no NestJS dependency and provides four explicit entry points:

- `/domain` — aggregate/event/error primitives;
- `/application` — CQRS base classes and repository/cache ports;
- `/persistence` — persistence decorators/adapters/helpers;
- `/http` — HTTP status mapping for its own errors.

Domain and application code should use the narrow entry points rather than the compatibility root barrel.

| Export                | Layer          | Description                                                                           |
|-----------------------|----------------|-----------------------------------------------------------------------------------------|
| `RootEntity`          | `/domain`      | Abstract base entity with UUID v7 identity, `createdAt`/`updatedAt` lifecycle, accessor mappings, and mutation tracking |
| `RootEntitySnapshot`  | `/domain`      | Interface for serializing/rehydrating entities                                        |
| `DomainException`     | `/domain`      | Abstract base class for framework-agnostic domain invariant exceptions                  |
| `DomainEvent`         | `/domain`      | Abstract base class for domain events (carries a UUID v7 `id`)                        |
| `RootDomainEvent`     | `/domain`      | Domain event with detached immutable payload and event-time aggregate ID/version       |
| `@ApplyMutation()`    | `/domain`      | Completes a domain mutation: calls `onUpdate()` and records events from the result    |
| `@Mutable()`          | `/domain`      | Declares an aggregate field as patchable through `applyPatch(...)`                    |
| `CommandBaseHandler`  | `/application` | Base CQRS command handler that dispatches and clears uncommitted events                 |
| `ICommandRepository`  | `/application` | Port for write repositories                                                            |
| `IQueryRepository`    | `/application` | Port for read repositories                                                             |
| `ICache<T>`           | `/application` | Interface for cache providers (`get`, `set`, `delete`)                                |
| `@Cache()`            | `/persistence` | Decorator for `save()` — write-through cache on writes, evict on delete, explicit keys |
| `@FromCache()`        | `/persistence` | Decorator for `find()` — read-through cache with fail-closed semantics and hydration   |

MikroORM adapters, such as `AggregateRepository`, `MikroOrmCache` and `UnixTimestampType`,
live in [`@cqrs-ddd/mikro-orm`](packages/ddd-mikro-orm).

Import domain primitives in your domain layer:

```typescript
import { ApplyMutation, DomainException, RootDomainEvent, RootEntity } from '@cqrs-ddd/core/domain';
```

### `api` — Full Working Application

The `api/` directory contains a complete working application:

```bash
cd api
pnpm install
pnpm build              # build workspace dependencies
cp .env.example .env    # create local environment file (edit as needed)
pnpm db:migrate         # apply schema + data migrations (idempotent)
pnpm dev                # build, then rebuild and restart on source changes
```

Configure the database via environment variables (defaults to a local file):

| Variable             | Default         | Description                          |
|----------------------|-----------------|--------------------------------------|
| `DATABASE_URL` | `file:src/persistence/local.db` | libSQL URL, used unchanged for one tenant |
| `SQLITE_TENANTS` | _(none)_ | Additional libSQL tenant names; local files get a tenant suffix |
| `SQLITE_DATABASE_TEMPLATE` | _(none)_ | URL containing `{tenant}`; required for multiple remote tenants |
| `AUTH_TOKEN`   | _(none)_        | Auth token for libSQL remote databases (e.g. Turso) |

`DB_ENGINE=postgres` switches to PostgreSQL with a schema per tenant; the
[api README](api/README.md) lists every variable.

Both persistence engines require `x-tenant-schema` on routed HTTP requests.
PostgreSQL selects a schema; libSQL selects the corresponding database.

**CRUD operations:**

```bash
# Log in as the seeded admin, then copy `accessToken` from the JSON response.
# The refresh token arrives as an HttpOnly cookie; POST /auths/refresh exchanges it.
curl -X POST http://localhost:3000/auths/login -c cookies.txt \
  -H 'Content-Type: application/json' \
  -H 'x-tenant-schema: tenant' \
  -d '{"email":"alice+tenant@seed.local","code":"secret-code"}'
export TOKEN='<accessToken from login response>'

# Create a user
curl -X POST http://localhost:3000/users \
  -H 'Content-Type: application/json' \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'x-correlation-id: demo-123' \
  -d '{"name": "Aristotelis", "email": "aristotelis@example.com"}'

# Get all users
curl -X GET http://localhost:3000/users \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN"

# Get by ID
curl http://localhost:3000/users/<id> \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN"

# Update
curl -X PATCH http://localhost:3000/users/<id> \
  -H 'Content-Type: application/json' \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "NewName"}'

# Delete a user
curl -X DELETE http://localhost:3000/users/<user-id> \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN"

# Run with Fastify adapter
ADAPTER=fastify pnpm start
```

**What it demonstrates:**

- Global + per-handler pipeline behaviors
- Decoupled domain invariants with framework-agnostic `DomainException` & presentation-boundary `DomainExceptionFilter` (mapping to 400, 409, 422)
- Clean Architecture persistence repository boundaries: CQRS handlers inject exclusively `ICommandRepository` and `IQueryRepository`, completely decoupled from ORM/database client classes (zero `MIKRO_ORM_CLIENT` leakage in handlers)
- Persistent token revocation on logout via `RevokeAuthCommand`, per-request permission loading in `CaslPermissionSource`, and explicit principal classification
- Optimistic concurrency with aggregate version tracking on `User` and `Role` entities. Persistence adapters translate driver/ORM conflict diagnostics into the transport-neutral `ConcurrencyConflictError`; the HTTP presentation filter maps that error to `409 Conflict`.
- Injectable `CaslAuthorizer` in CQRS command and query handlers: `authorize` before writes, `project` for read models and responses
- Per-handler CASL requirements declared with `requires(...)`
- MikroORM-backed CASL permission source (roles, per-user grants and denials)
- Official MikroORM `accessor: true` entity schemas bridging private aggregate fields to public accessors without TypeScript bypasses
- Decoupled CQRS caching architecture with collision-safe key derivation (`cacheKey`), fail-fast handler templates (`cacheKeyTemplate`), and static aggregate naming (`User.aggregateName`)
- Versioned database migrations with tracking (`mikro_orm_migrations` table)
- Zod-parsed/validated commands and queries via `createCommand()` and `createQuery()` exposing Standard Schema (`['~standard']`) metadata
- Controller-level schema validation through Nest's `StandardSchemaValidationPipe` with `zodBadRequest`
- Zod transform mappers (DTO → Command mapping)
- OpenTelemetry tracing with `TraceBehavior` and metrics with `MetricsBehavior`
- Command- and event-scoped `DeadLetterBehavior` sending failed executions to a BullMQ `dead-letters` queue for inspection and replay (restricted to mutating command and event failures, excluding read queries and validation errors, with `UserCreatedHandler` opting into `{ rethrow: false }` only after successful delivery); transport failures are logged and preserve the original handler error
- Per-handler `RateLimitBehavior` throttling `CreateUserHandler` to 5 registrations / 60s per email (in-memory limiter), with `RateLimitExceededFilter` mapping breaches to HTTP 429 + `Retry-After`
- Per-handler `AuditBehavior` recording the sensitive `user.delete` action (actor, outcome, duration, redacted payload) to the default `LogAuditSink`, with the actor resolved from the request-scoped session
- Per-handler `IdempotencyBehavior` atomically excluding concurrent duplicates for `CreateUserHandler` per tenant + principal + email and replaying completed successful responses; with the default `releaseOnError: true`, a failed execution releases the key so a later retry may execute again. `IdempotencyConflictFilter` maps in-flight duplicates to HTTP 409 and payload-mismatched key reuse to HTTP 422
- DDD-style `User` and `Role` entities built on `ddd-core` primitives (`RootEntity`, `RootDomainEvent`)
- MikroORM (libSQL and PostgreSQL drivers) persistence with multi-tenant database/schema isolation
- Pluggable `ICache<T>` — `MikroOrmCache` (MikroORM-backed, TTL-aware) or `MemoryCache` swapped via a single provider token
- Correlation ID propagation across HTTP middleware, handlers, processors, and events
- Express and Fastify adapter support with secure session cookie and Bearer/API-key authentication

---

## Repository Structure

```
nestjs-pipeline/
├── package.json                  # root — workspace scripts
├── pnpm-workspace.yaml           # declares packages/* and api
├── tsconfig.base.json            # shared TypeScript config
├── packages/
│   ├── pipeline/                 # @nestjs-pipeline/core
│   │   └── src/
│   │       ├── behaviors/        # LoggingBehavior
│   │       ├── constants/        # pipelineStore (AsyncLocalStorage)
│   │       ├── decorators/       # @UsePipeline
│   │       ├── helpers/          # behavior entries, logging intent, toPostgresJson
│   │       ├── interfaces/       # IPipelineBehavior, IPipelineContext
│   │       ├── options/          # PipelineModuleOptions, GlobalBehaviorsOptions
│   │       ├── services/         # handler discovery, chain planning, runner
│   │       ├── pipeline.context.ts
│   │       └── pipeline.module.ts
│   ├── pipeline-correlation/      # @nestjs-pipeline/correlation
│   │   └── src/
│   │       ├── decorators/       # @WithCorrelation, CorrelationFrom
│   │       ├── middlewares/      # HttpCorrelationMiddleware
│   │       ├── options/          # CorrelationOptions
│   │       └── correlation.store.ts    # correlationSource, getCorrelationId, runWithCorrelationId, addCorrelationId
│   ├── pipeline-zod/             # @nestjs-pipeline/zod
│   │   └── src/
│   │       ├── errors/           # ZodValidationError
│   │       ├── filters/          # ZodValidationFilter
│   │       ├── pipes/            # createZodMapper, zodBadRequest
│   │       └── zod-validation.behavior.ts  # parse/validate and apply successful object output
│   ├── pipeline-casl/            # @nestjs-pipeline/casl
│   │   └── src/
│   │       ├── constants/        # Tokens, context keys, CASL_ACTIONS/SUBJECTS
│   │       ├── errors/           # UnauthorizedActionException
│   │       ├── helpers/          # Capability codec, buildAbility, projection, CaslAuthorizer, requires()
│   │       ├── interfaces/       # ICaslPermissionSource, CaslPrincipal
│   │       ├── casl.behavior.ts
│   │       └── casl.module.ts
│   ├── pipeline-opentelemetry/   # @nestjs-pipeline/opentelemetry
│   │   └── src/
│   │       ├── trace.behavior.ts     # TraceBehavior (OTel Trace API)
│   │       └── metrics.behavior.ts   # MetricsBehavior (OTel Metrics API)
│   ├── pipeline-resilience/      # @nestjs-pipeline/resilience
│   │   └── src/
│   │       ├── constants/        # RESILIENCE_DEFAULT_OPTIONS token
│   │       ├── helpers/          # buildResiliencePolicy (cockatiel composition)
│   │       ├── interfaces/       # ResilienceBehaviorOptions and layer option types
│   │       ├── resilience.behavior.ts
│   │       └── resilience.module.ts
│   ├── pipeline-cache/           # @nestjs-pipeline/cache
│   │   └── src/
│   │       ├── constants/        # PIPELINE_CACHE, CACHE_DEFAULT_OPTIONS tokens
│   │       ├── helpers/          # buildCache / buildKeyv (store factory), cache-key
│   │       ├── interfaces/       # CacheModuleOptions, CacheBehaviorOptions, CacheStoreConfig
│   │       ├── cache.behavior.ts
│   │       └── cache.module.ts
│   ├── pipeline-feature-flags/   # @nestjs-pipeline/feature-flags
│   │   └── src/
│   │       ├── constants/        # FEATURE_FLAGS_CLIENT and default-options/context tokens
│   │       ├── errors/           # FeatureDisabledError
│   │       ├── helpers/          # buildEvaluationContext (targeting context)
│   │       ├── interfaces/       # FeatureFlagBehaviorOptions, FeatureFlagsModuleOptions
│   │       ├── feature-flag.behavior.ts  # FeatureFlagBehavior (OpenFeature gating)
│   │       └── feature-flags.module.ts
│   ├── pipeline-deadletter/      # @nestjs-pipeline/deadletter
│   │   └── src/
│   │       ├── constants/        # DEAD_LETTER_TRANSPORT, DEAD_LETTER_DEFAULT_OPTIONS tokens
│   │       ├── helpers/          # buildDeadLetterRecord
│   │       ├── interfaces/       # DeadLetterTransport, DeadLetterRecord, options types
│   │       ├── transports/       # BullMQ, RabbitMQ, Postgres bundled transports
│   │       ├── dead-letter.behavior.ts   # DeadLetterBehavior (capture/send attempt for failed requests)
│   │       └── dead-letter.module.ts
│   ├── pipeline-rate-limit/      # @nestjs-pipeline/rate-limit
│   │   └── src/
│   │       ├── constants/        # RATE_LIMITER, RATE_LIMIT_DEFAULT_OPTIONS tokens
│   │       ├── errors/           # RateLimitExceededError
│   │       ├── filters/          # RateLimitExceededFilter (HTTP 429 + Retry-After)
│   │       ├── helpers/          # buildRateLimitKey
│   │       ├── interfaces/       # RateLimiterLike, RateLimitBehaviorOptions, module options
│   │       ├── rate-limit.behavior.ts    # RateLimitBehavior (rate-limiter-flexible)
│   │       └── rate-limit.module.ts
│   ├── pipeline-audit/           # @nestjs-pipeline/audit
│   │   └── src/
│   │       ├── constants/        # AUDIT_SINK, AUDIT_DEFAULT_OPTIONS tokens
│   │       ├── helpers/          # redactValue, buildAuditRecord
│   │       ├── interfaces/       # AuditSink, AuditRecord, options types
│   │       ├── sinks/            # LogAuditSink (default), PostgresAuditSink drop-in
│   │       ├── audit.behavior.ts # AuditBehavior (records who/what/outcome/duration)
│   │       └── audit.module.ts
│   ├── pipeline-idempotency/     # @nestjs-pipeline/idempotency
│   │   └── src/
│   │       ├── constants/        # IDEMPOTENCY_STORE, IDEMPOTENCY_DEFAULT_OPTIONS tokens
│   │       ├── errors/           # IdempotencyConflictError
│   │       ├── filters/          # IdempotencyConflictFilter (HTTP 409 / 422)
│   │       ├── helpers/          # fingerprintValue (stable payload hash)
│   │       ├── interfaces/       # IdempotencyStore, IdempotencyRecord, options types
│   │       ├── stores/           # Memory (default), Redis, Postgres drop-in stores
│   │       ├── idempotency.behavior.ts   # IdempotencyBehavior (concurrent exclusion + successful replay)
│   │       └── idempotency.module.ts
│   ├── pipeline-tenant/          # @nestjs-pipeline/tenant
│   │   └── src/
│   │       └── tenant-scope.ts   # tenantSource, currentTenantId, runWithTenant
│   ├── pipeline-job-context/     # @nestjs-pipeline/job-context
│   │   └── src/
│   │       ├── decorators/       # @InJobContext, @AsSystem
│   │       ├── errors/           # MissingJobContextError, InvalidJobContextError
│   │       ├── helpers/          # withJobContext, payload validation
│   │       ├── interfaces/       # IJobPrincipal, PrincipalReference, JobContext
│   │       └── job-context.module.ts   # JobContextModule.forRoot({ principal, tenants, sources })
│   ├── uuidv7/                   # @cqrs-ddd/uuidv7 — RFC 9562 UUIDv7, no dependencies
│   ├── safe-stringify/           # @cqrs-ddd/safe-stringify — strict and log-safe JSON, key segments
│   ├── untyped/                  # @cqrs-ddd/untyped — typed replacement for `as any`
│   ├── ddd-mikro-orm/            # @cqrs-ddd/mikro-orm — repositories, optimistic writes, cache, dialect, TenantStore
│   └── ddd-core/                 # @cqrs-ddd/core — framework-neutral DDD primitives
│       ├── domain/               # RootEntity, AggregateRoot, domain events and exceptions
│       ├── application/          # CQRS base classes, repository and cache ports, tenant scope
│       ├── persistence/          # repository base classes, lifecycle decorators, in-memory cache
│       └── http/                 # HTTP status mapping for its errors
└── api/                          # @nestjs-pipeline/ddd-api — full working example using ddd-core + casl
    └── src/
        ├── persistence/          # MikroOrmStore, schemas/, migrations, cli.ts
        ├── roles/                # role and capability CRUD
        ├── auths/                # login, sessions, permission source, job principal
        └── users/
            ├── cqrs/             # Commands, queries, events
            ├── domain/           # User entity, domain events
            └── persistence/      # Repositories
```

---

## Development

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run persistence lint and workspace unit/integration tests (no build or E2E)
pnpm test

# Run workspace tests with coverage
pnpm test:coverage

# Run individual stages
pnpm test:unit
pnpm test:build
pnpm test:e2e

# Persistence Grit checks and package typechecks
pnpm lint

# Format / lint with Biome (including Grit persistence rules)
pnpm check

# Run only persistence plugin diagnostics
pnpm lint:persistence

# Clean build artifacts
pnpm clean

# Remove every generated file: node_modules, dist, coverage, caches, *.tsbuildinfo, license copies
pnpm clean:all
pnpm install
```

`pnpm test:coverage` runs each workspace’s existing test script sequentially with Vitest coverage. It prints test results and a coverage summary per workspace, and writes `coverage/coverage-summary.json` in each workspace. Reports cover the same tests selected by each workspace’s Vitest configuration; E2E tests run separately. All workspaces run even if one fails, and any failure makes the command fail. There is no combined monorepo coverage total.

### Lint rules

Architecture rules are native Biome Grit plugins in `biome/plugins/`, registered and scoped
in `biome.json`. They report diagnostics and never rewrite code; they run in `pnpm check`,
in editors, and in `pnpm lint:persistence` before `test:unit`. Grit matches syntax, not
types: a rule sees names and import sources, not what a value is.

| Plugin | Rule |
| --- | --- |
| `persistence-lifecycle.grit` | `save()` in `persistence/` uses `@PersistedWrite` or `@Cache` → `@AcknowledgePersisted` → `@MapPersistenceErrors` in that order; awaited `optimisticUpdate()`; no manual `acknowledgePersisted`/`markPersisted`; no hand-rolled `try`/`catch` in a command repository `save()` |
| `aggregate-identity.grit` | No writes to hydration properties (`id`, `version`, `username`, …) on receivers named `user`, `role`, `aggregate` or `entity` in application layers. A naming convention, not a type-aware guarantee |
| `domain-mutation.grit` | In aggregates, events go in `@ApplyMutation({ event })`, which is required, and mutations use `applyPatch()` |
| `handler-boundaries.grit` | Handlers and application services import no `@mikro-orm/*`, store or ORM token |
| `ddd-layering.grit`, `ddd-entry-points.grit` | Domain and CQRS code do not import `@cqrs-ddd/core/persistence`; api code imports a layered entry point, not the root |
| `transport-neutral-errors.grit` | No Nest HTTP exceptions in packages, domain, application or CQRS code; presentation adapters map neutral errors |
| `event-handler-substance.grit` | Warns on an event handler that only logs or reads the correlation ID (`warn`, because the api keeps such showcase handlers) |
| `core-environment.grit` | No `process.env` in published packages or `packages/ddd-core`; configuration comes through module options or ports |
| `framework-independence.grit` | `packages/ddd-core`, `ddd-mikro-orm`, `uuidv7`, `safe-stringify` and `untyped` import nothing from NestJS or `@nestjs-pipeline/*`, in any import form |
| `orm-independence.grit` | `packages/ddd-core` imports no ORM or database driver |
| `verify-package-licenses.grit` | Published packages import neither the private `api` nor `@nestjs-pipeline/ddd-*`, and `@nestjs-pipeline/*` packages do not import `@cqrs-ddd/core` |
| `package-licenses.grit` | Published packages import no private NestJS internals |
| `test-suite.grit` | No focused tests (`.only`, `fit`, `fdescribe`) |

Package manifests are checked by specs instead, because Grit cannot match JSON:
`packages/pipeline/src/package-boundaries.spec.ts` requires a package whose source imports
`@nestjs-pipeline/core` to peer on it through `workspace:^`, and a package that does not
import it not to declare it; none may depend on it at runtime (a second copy of core
silently loses its async-local context and behavior identity). It also forbids
dependencies on the private `api`; each `@cqrs-ddd/*` package has its own
`package-manifest.spec.ts`. `api/test/lint/biome-persistence-plugin.spec.ts` and
`biome-general-plugins.spec.ts` run every rule against the real Biome CLI.

### Releasing

A release bumps only the packages whose published content changed; `CHANGELOG.md`
records each release and lists them. A package that depends on a bumped one keeps its
range as long as the range still covers the new version (`workspace:^` publishes as
`^<version>`). Before publishing:

1. Run `pnpm verify:all` (type checks, unit, build, release and E2E suites; E2E needs a
   container runtime). `pnpm test:release` packs every package and loads it from its
   tarball in an isolated consumer.
2. Run `pnpm copy-licenses && pnpm -r publish --access public --dry-run --no-git-checks`
   and check the list: every `@cqrs-ddd/*` and `@nestjs-pipeline/*` package, no private
   workspace (`@nestjs-pipeline/ddd-api`).
3. The npm organizations `cqrs-ddd` and `nestjs-pipeline` must exist, with your account
   allowed to publish to both.
4. Merge to `master`, then run `pnpm publish:all`. It copies the license files into each
   package and publishes in dependency order; each package rebuilds in
   `prepublishOnly`. `pnpm -r publish` skips every package whose version is already on
   the registry, so only the bumped packages are published.
5. Tag each published package as `<name>@<version>` (for 0.2.1:
   `git tag @cqrs-ddd/core@0.2.1`, `@nestjs-pipeline/casl@0.2.1`, … for the ten packages
   in the changelog) and the release as `v<version>`, then push the tags.

`pnpm test:release` (`integration/packages/release.mjs`) packs every non-private
`packages/*` workspace and checks each archive: name and version, licenses, JavaScript and
declarations, `engines.node` equal to the root's, a README without relative links outside
the package (they break on npmjs.com), no tests, and no dependency on the private `api`. No
`@nestjs-pipeline/*` package may name `@cqrs-ddd/core`. Missing, duplicate or unexpected
archives fail it. A temporary consumer outside the checkout then installs every tarball,
with required peers at the lockfile's versions and automatic peer installation off, and
compiles and runs the fixtures in `integration/packages/consumer/src/` (request-scoped
behaviors across two Nest applications, the typed intent builders, CASL 7 startup). Every
`.ts` file there is compiled and run; add a fixture for a new cross-package contract.
Finally, each `@cqrs-ddd/*` package is installed alone with its peers and the packed
packages it needs, and no NestJS: it fails if it depends on anything outside the release,
pulls in anything else, or an entry point yields no exports. Requirements: the repository's
Node and pnpm, `tar`, and registry access for uncached dependencies.

### Agent context files

`CLAUDE.md` and `.claude/codebase-map.md` give coding agents a compact orientation map of
the repository; `AGENTS.md` holds the rules every agent follows. The files:

| Path | Tracked | Purpose |
| --- | --- | --- |
| `CLAUDE.md`, and nested `CLAUDE.md` under `packages/`, `packages/pipeline/`, `packages/ddd-core/`, `packages/ddd-mikro-orm/`, `api/` | yes | Working instructions, and local rules per area |
| `.claude/codebase-map.md` | yes | The map: generated sections plus human-owned sections |
| `.claude/tasks/TEMPLATE.md`, `.claude/tasks/<task-id>.md` | yes | Template, and one file per active multi-step task |
| `.claude/settings*.json`, `.claude/state/context-checkpoint.md` | no | Local settings and the pre-compaction checkpoint |

```bash
pnpm context:update     # regenerate the map's generated sections (human-written ones are preserved)
pnpm context:check      # fail if the committed map no longer matches the repository
pnpm context:validate   # required files and headings, secret scan, size budget, path references, generator run
```

The scripts in `scripts/` need Python 3.9+ and optionally `git`, with no third-party
packages. `update-claude-snapshot.py` inspects structure only — manifests, directory layout,
import specifiers, `process.env` names, README first paragraphs, git metadata — through
`git ls-files`, and never executes project code, reads `.env*` or key material, or uses the
network. `<!-- context:generated-* -->` blocks are rewritten on every run;
`<!-- context:manual-* -->` blocks are copied through unchanged. `--check` ignores the
volatile metadata fields, so only structural drift makes the map stale. Regenerate when
architecture, modules, dependencies, entry points, commands or conventions change, then
update the manual sections and run `pnpm context:validate`.

A task file (`cp .claude/tasks/TEMPLATE.md .claude/tasks/<task-id>.md`) records decisions
and verified results of active work only; when the task is done, move what is durable into
source or a README and delete the file. `.claude/settings.json` registers a `PreCompact`
hook, `scripts/claude-context-checkpoint.py`, that writes the current branch, commit,
changed paths and task files to `.claude/state/context-checkpoint.md`. It never reads the
conversation or file contents and always exits 0; remove the `hooks` block to disable it.

## Adding a New Behavior Package

1. Create `packages/pipeline-<name>/` with `package.json`, `tsconfig.json`, `tsconfig.build.json`, and `src/index.ts`.

2. Add `@nestjs-pipeline/core` as a peer dependency:

   ```json
   {
     "peerDependencies": {
       "@nestjs-pipeline/core": "workspace:^"
     },
     "devDependencies": {
       "@nestjs-pipeline/core": "workspace:*"
     }
   }
   ```

3. Implement `IPipelineBehavior`:

   ```typescript
   import { Injectable } from '@nestjs/common';
   import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';

   @Injectable()
   export class TimingBehavior implements IPipelineBehavior {
     constructor(private readonly timings: TimingService) {}

     async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
       const started = performance.now();
       try {
         return await next();
       } finally {
         this.timings.record(context.requestName, performance.now() - started);
       }
     }
   }
   ```

4. Export from `src/index.ts`:

   ```typescript
   export { TimingBehavior } from './timing.behavior';
   ```

5. The package is included through `pnpm-workspace.yaml`. Follow
   [packages/CLAUDE.md](packages/CLAUDE.md) for the rest: license headers, a README, 100%
   per-file coverage in `vitest.config.ts`, and `pnpm test:release`.

---

## License and Commercial Use

This software is **Dual-Licensed**.

By default, this project is licensed under the **GNU AGPLv3** (see the `LICENSE` file). You can use, modify, and distribute it freely, provided your entire application is also open-sourced under the AGPLv3.

**Commercial License (No AGPL Restrictions)**

If you are using this software commercially and cannot (or do not want to) open-source your application under the AGPLv3, you must use the **Commercial License** (see `COMMERCIAL_LICENSE.txt`).

Revenue-based pricing:

| Annual Gross Revenue | Fee |
|---|---|
| Under $500,000 | **Free** |
| $500,001 — $10,000,000 | 0.1% of gross revenue |
| $10,000,001 — $50,000,000 | 0.05% of gross revenue |
| Over $50,000,000 | 0.01% of gross revenue (capped at $50,000/year) |

Contact: **aristotelis@ik.me**
