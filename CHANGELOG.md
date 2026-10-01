# Changelog

## 0.2.2

A release of `@nestjs-pipeline/zod`, `/casl`, `/feature-flags`, `/idempotency` and
`/rate-limit`; the others keep their versions. Unlike 0.2.1, it needs a code change where
the exception filters are registered.

### Changed

- The exception filters `ZodValidationFilter`, `UnauthorizedActionFilter`,
  `FeatureDisabledFilter`, `IdempotencyConflictFilter` and `RateLimitExceededFilter` take
  Nest's `HttpAdapterHost` as their first constructor argument and answer through
  `httpAdapter.reply` (`RateLimitExceededFilter` sets `Retry-After` with
  `httpAdapter.setHeader`). Register them as `{ provide: APP_FILTER, useClass: X }`, or
  pass `app.get(HttpAdapterHost)` to `useGlobalFilters(new X(...))`.
  `FeatureDisabledFilter`'s options are its second argument.
- The five packages declare `@nestjs/core` `^11.0.0` as a peer dependency.

### Fixed

- On Fastify, a package error thrown in Nest middleware reached its filter with the raw
  Node response; the filter threw `TypeError: response.status is not a function` and the
  request got no answer. The filters now answer it.

A patch release of the ten packages below; the others stay at 0.2.0. Every change is an
addition or a documentation fix: no export, signature, behavior or peer range of 0.2.0
changes, so upgrading needs no code change.

### Added

- `@cqrs-ddd/core`: `requireTenant(purpose, source?)` returns the tenant for a
  security-sensitive operation, from `source` or the registered resolver, and throws
  `MissingTenantContextError` when there is none. `requireTenantId(source, purpose)`, the
  same with the arguments reversed, is deprecated and calls it.
- `@nestjs-pipeline/casl`: `abilityDigest(context?)`, the SHA-256 of the effective rules
  (conditions resolved against the principal), for cache-key scopes and idempotency replay
  scopes; `requireAbilityDigest(context?)`, which throws the new `MissingAbilityError`
  instead of returning `undefined`; `CaslAuthorizer.dependsOnEntity(action, subject)`,
  whether a conditional rule decides on entity attributes. Adds `@cqrs-ddd/safe-stringify`
  as a dependency.
- `@nestjs-pipeline/opentelemetry`: `AttributesBehavior` with `AttributesBehaviorOptions`
  (`factories`). It runs attribute factories once the rest of the chain has finished,
  successfully or not, and adds the result to the attribute bag that `TraceBehavior` and
  `MetricsBehavior` read. A failing factory contributes nothing; the others still apply.
- Attribute builders, each in `src/helpers/build-attributes.ts`, returning `{}` when their
  behavior did not run and never a cache, idempotency or rate-limit key:
  - `@nestjs-pipeline/cache`: `buildCacheAttributes` → `cache.hit`.
  - `@nestjs-pipeline/idempotency`: `buildIdempotencyAttributes` →
    `idempotency.replayed`, `idempotency.ownership_lost`.
  - `@nestjs-pipeline/rate-limit`: `buildRateLimitAttributes` →
    `rate_limit.remaining_points`.
  - `@nestjs-pipeline/feature-flags`: `buildFeatureFlagAttributes` → `feature_flag.key`,
    `feature_flag.enabled`, `feature_flag.variant`, `feature_flag.reason`,
    `feature_flag.error_code`.
  - `@nestjs-pipeline/deadletter`: `buildDeadLetterAttributes` → `dead_letter.captured`.

### Documentation

- `@nestjs-pipeline/zod`: examples use `z.email()` and `z.uuid()` instead of the
  deprecated `z.string().email()` and `z.string().uuid()`.
- `@nestjs-pipeline/audit`: the actor example reads `getSessionPrincipal()`.
- `@nestjs-pipeline/feature-flags`: the module example uses `TypedInMemoryProvider`
  (`@openfeature/server-sdk` 1.23+; `InMemoryProvider` before it).

## 0.2.0

Every package is released at 0.2.0. Five were on npm before; thirteen are released for the
first time.

### Requirements for every package

- Node.js 22 or later (`engines`).
- NestJS 11 for every `@nestjs-pipeline/*` package that peers on NestJS (`@nestjs-pipeline/tenant`
  has no peers). NestJS 10 is no longer supported.
- Packages that peer on `@nestjs-pipeline/core` require `^0.2.0` of it instead of any
  version.

### Upgrading from 0.1.x

The README's [Upgrading from 0.1.x](README.md#upgrading-from-01x) shows the common changes
with before-and-after code.

#### `@nestjs-pipeline/core` (from 0.1.18)

Breaking:

- Peers are `@nestjs/common`, `@nestjs/core` and `@nestjs/cqrs` `^11.0.0`.
- Removed from the public API: `PipelineBootstrapService`, `PIPELINE_MODULE_OPTIONS`,
  `PIPELINE_OPTIONS_REGISTRY`, `clearPipelineOptionsRegistry`, `SET_RESPONSE` and
  `SET_ORIGINAL_CORRELATION_ID`. Configure the pipeline through `PipelineModule.forRoot`
  or `forRootAsync`; a behavior can no longer set a context's response or original
  correlation ID.
- `context.correlationId` is read-only, and `originalCorrelationId` is removed: a behavior
  can no longer replace the correlation ID of a running pipeline. Set it where the work
  enters (`HttpCorrelationMiddleware`, `@WithCorrelation`, `runWithCorrelationId`).
- The module options `correlationIdFactory` and `correlationIdRunner` are removed. A
  pipeline takes its tenant and correlation id from the `sources` module
  option when it starts (`tenantSource` of `@nestjs-pipeline/tenant`, `correlationSource`
  of `@nestjs-pipeline/correlation`), or from the pipeline it is nested in, generates a
  `uuidv7()` correlation id when there is none, and runs its behaviors inside both values.
  Set them where work enters the application: `runWithTenant` of `@nestjs-pipeline/tenant`, `HttpCorrelationMiddleware`
  or `runWithCorrelationId` of `@nestjs-pipeline/correlation`.
- The new `diagnostics` option defaults to `'strict'`: a handler whose pipeline does not
  meet a behavior's `PIPELINE_BEHAVIOR_CONTRACT` makes bootstrap throw a
  `PipelineConfigurationError`. Pass `'warn'` or `'off'` to relax it.
- `loggerProvider` is typed `PipelineLoggerProvider` instead of any `Provider`: its
  `provide` must be `LOGGING_BEHAVIOR_LOGGER`.
- `@cqrs-ddd/uuidv7`, `@cqrs-ddd/untyped` and `@cqrs-ddd/safe-stringify` are new runtime
  dependencies.
- `getBehaviorId(cls)` returns the class itself when no `PIPELINE_BEHAVIOR_ID` is set,
  instead of `cls.name`, so two behaviors with the same class name no longer collide.
- `PIPELINE_BEHAVIOR_ID` is `Symbol.for('@nestjs-pipeline/core:PIPELINE_BEHAVIOR_ID')`
  instead of a local `Symbol`, so it matches across duplicate copies of core.
- When several NestJS applications in one process wrap the same handler class, calling it
  on an instance that none of them created throws, instead of running without any
  pipeline.
- `LoggingBehavior` masks sensitive fields in logged payloads by default
  (`redactSensitiveKeys: true`, using `DEFAULT_REDACT_KEYS`). Key matching ignores case,
  `_` and `-`, so `refreshToken` also masks `refresh_token`. `excludeKeys` also applies to
  the properties of cloned `Error` objects and to `Map` keys.

Added:

- `PipelineModule.forRootAsync` (`PipelineModuleAsyncOptions`, `PipelineOptionsFactory`,
  `PipelineLoggerProvider`), `PipelineModuleFeatureOptions`, the `diagnostics` option, the `logging()` intent
  helper and `@SkipPipeline`.
- Pipeline items: `createPipelineItem`, `getPipelineItem`, `setPipelineItem`,
  `hasPipelineItem`, `requirePipelineItem`, `MissingPipelineItemError`.
- Behavior contracts and bootstrap diagnostics: `PIPELINE_BEHAVIOR_CONTRACT`,
  `PipelineConfigurationError` and their types.
- `context.tenantId`, the tenant of the execution; it is write-once, so assigning a
  different tenant throws. `SET_TENANT_ID` sets it in a custom runner.
- `LoggingBehavior` options `redactKeys` and `redactSensitiveKeys`.
- `toPostgresJson`.
- `tenantSegments` and `TenantPartitionOptions`, the tenant part of the cache,
  idempotency and rate-limit key factories, and `MissingPartitionError`, the base of their
  partition errors. The cache key factory now also takes `includeTenant`.
- The `sources` module option with `ContextSource` and `ContextSources`: where pipelines
  take their tenant and correlation id from. Bootstrap warns when it is omitted; pass
  `sources: {}` to run without sources on purpose.

Removed from the public API: `uuidv7`, `isUuidV7` and `untyped`. Import them from
`@cqrs-ddd/uuidv7` and `@cqrs-ddd/untyped`. The serializers, which 0.1.18 did not export,
are public in `@cqrs-ddd/safe-stringify`.

#### `@nestjs-pipeline/correlation` (from 0.1.8)

Breaking:

- Peer: `@nestjs/common` `^11.0.0` (was `^10.0.0 || ^11.0.0`). It still depends on no
  pipeline package; `@cqrs-ddd/uuidv7` and `@cqrs-ddd/untyped` are new dependencies.
- `setCorrelationFallback` and `uuidv7` are no longer exported. Import `uuidv7` from
  `@cqrs-ddd/uuidv7`, which has the same API and output.
- `correlationStore` is replaced by `correlationSource`. Pass it to
  `PipelineModule.forRoot({ sources: { correlationId: correlationSource } })` so a pipeline
  takes the id and `getCorrelationId()` in a handler returns the pipeline's id.
  `runWithCorrelationId`, `getCorrelationId`, `correlationHeaders` and `@WithCorrelation`
  keep their API.
- `HttpCorrelationMiddleware` sets the correlation header on the response, lowercases the
  configured header name and throws at construction on an invalid one. New options:
  `acceptIncoming`, `trimIncoming`, `maxLength` and `validateIncoming`.
- `addCorrelationId` throws a `TypeError` for any value that is not a plain object (class
  instances included), not only for arrays.
- An incoming correlation ID longer than 128 characters, or not matching
  `DEFAULT_CORRELATION_ID_PATTERN`, is discarded and replaced by a locally generated ID.

Added: `correlationSource`, `DEFAULT_CORRELATION_HEADER`,
`DEFAULT_CORRELATION_ID_MAX_LENGTH`, `DEFAULT_CORRELATION_ID_PATTERN`.

#### `@nestjs-pipeline/opentelemetry` (from 0.1.8)

Breaking: `@nestjs/common` `^11.0.0`; `@nestjs-pipeline/core` `^0.2.0`.

- `TraceBehavior` no longer implements `onModuleInit`, no longer injects a logger and no
  longer checks whether an SDK is registered.
- `TraceBehaviorOptions` is exported as a type only.
- A tracer, a meter or an enrichment callback that throws never replaces the handler's
  result or error, and never runs the handler twice.

Added: spans carry `pipeline.tenant_id`, `pipeline.outcome` and `error.type`;
`MetricsBehavior` records a `pipeline.handler.active` counter and labels instruments with
`outcome` and `pipeline.outcome`. Also added: `MetricsBehavior` and `metrics()`, `trace()`, `buildTraceAttributes`,
`buildMetricAttributes`, `addPipelineTelemetryAttributes`,
`getPipelineTelemetryAttributes`, `PIPELINE_OTEL_ATTRIBUTES`,
`PIPELINE_TELEMETRY_ATTRIBUTES` and their types.

#### `@nestjs-pipeline/zod` (from 0.1.6)

Breaking:

- Peers: `zod` `^4.3.0` (was `^4.0.0`), `@nestjs/common` `^11.0.0`,
  `@nestjs-pipeline/core` `^0.2.0`.
- `ZOD_SCHEMA`, the deprecated alias, is removed; use `ZOD_SCHEMA_KEY`.
- `ZodValidationBehavior` applies the parsed output to the request instead of only
  validating: it parses with `safeParseAsync`, deletes keys the schema strips and assigns
  coerced and defaulted values before the handler runs. A top-level output that is not a
  plain object is rejected with a `TypeError`, as is a non-object request with a schema.
- `ZodPipe.transform()` returns a `Promise` and parses asynchronously.

Added:

- `createCommand`, `createQuery` and `createZodRequest`, with `InferInput`,
  `InferOutput` and the class types.
- `updatable` and `updatableFieldsOf`: mark a command field in its schema, and
  `createCommand()` lists the marked fields as `updatableFields`.
- `createZodMapper`; `getRawInput`, `getValidatedData`, `ZOD_RAW_INPUT_KEY`,
  `ZOD_VALIDATED_DATA_KEY`.

#### `@nestjs-pipeline/casl` (from 0.1.1)

Breaking:

- Peers: `@casl/ability` `^7.0.0` (was `^6.0.0`), `@nestjs/common` `^11.0.0`,
  `@nestjs-pipeline/core` `^0.2.0`.
- The provider API is replaced by one permission source. Removed:
  `CASL_ROLE_PROVIDER`, `CASL_USER_CAPABILITY_PROVIDER`, `CASL_USER_CONTEXT_RESOLVER`,
  `CASL_USER_CONTEXT_KEY`, `CASL_SUBJECT_CONTEXT_PATHS`, `CASL_FIELDS_FROM_REQUEST`,
  `CASL_BEHAVIOR_LOGGER`, `IRoleProvider`, `IUserCapabilityProvider`,
  `IUserContextResolver`, `StaticRoleProvider`, `CaslUserContext`, `RoleDefinition`,
  `UserCapabilities`, `buildAbilityFromRules`, `capabilityToRawRule` and
  `capabilitiesToRawRules`. Implement `ICaslPermissionSource`, whose `load()` returns
  `{ principal, rules }` or `null`, and register it with
  `CaslModule.forRoot({ permissionSource })`.
- `buildAbility(roles, user, additional, denied)` becomes `buildAbility(rules, principal)`.
- `CaslBehaviorOptions` loses `subjectFromRequest`, `subjectContextPaths`,
  `fieldsFromRequest`, `skipCheck` and `prebuiltAbility`; `rules` is required and
  non-empty (`requires()` builds it). `CaslBehavior` no longer takes a logger.
- A denial throws `UnauthorizedActionException` (it extends `Error`) instead of NestJS's
  `ForbiddenException`; register `UnauthorizedActionFilter` to answer HTTP 403.
- A rule condition whose placeholder resolves to an object throws, because CASL would
  read the object as query operators.

Added: `requires()`, `CaslAuthorizer` (`can`, `authorize`, `project`),
`UnauthorizedActionException` and `UnauthorizedActionFilter` (HTTP 403),
`getCaslAbility`, `getCaslPrincipal`, `hasEntityConditions`, `CASL_PERMISSION_SOURCE`,
`CASL_PRINCIPAL_KEY`, `CASL_BEHAVIOR_ID`, `CASL_ACTIONS`, `CASL_SUBJECTS` and their types.

### First releases

- `@nestjs-pipeline/audit`: records every audited request, on success and failure, to an
  `AuditSink` (console by default, Postgres bundled), with payload redaction. Only
  commands are audited unless `captureKinds` lists queries or events. A sink that
  implements `begin` (the Postgres sink does) receives a pending record before the
  handler runs, then the final record under the same id, so a process stop leaves a
  `pending` row instead of none. With the
  default `failOpen: true`, a sink failure is logged and the request's outcome is kept.
  With `failOpen: false`, a sink failure fails a successful request; if the handler had
  already failed, its own error is rethrown unchanged and the sink failure is logged.
- `@nestjs-pipeline/cache`: read-through caching for queries on cache-manager 7 and Keyv.
  `key` is required: there is no default key.
- `@nestjs-pipeline/deadletter`: captures failed requests through a `DeadLetterTransport`
  (BullMQ, RabbitMQ and Postgres bundled); events by default, commands and queries when
  listed in `captureKinds`. The Postgres transport is a `DeadLetterStore`, and
  `DeadLetterRedriver` replays a stored record, counts failed attempts and resolves it;
  a redacted payload is not replayed without a `rebuild`. `rethrow: false` swallows an
  event handler's error only, and is a bootstrap error on a command or query handler.
  The RabbitMQ transport is tested with a mocked channel only.
- `@nestjs-pipeline/feature-flags`: gates handlers through OpenFeature.
  `FeatureDisabledFilter` answers HTTP 403, or 404 with `{ status: 404 }` to hide the
  feature. `allowedVariants` gates on a variant, and `errorPolicy` (`'use-default'` or
  `'throw'`) decides what a provider error does.
- `@nestjs-pipeline/idempotency`: concurrent-duplicate exclusion and replay of successful
  responses, with memory (default), Redis and Postgres stores. A failed execution releases
  its key by default. The Postgres store keeps responses as JSON text, so every response,
  including one with NUL characters or unpaired surrogates, replays exactly. Keys take
  core's `includeTenant` and `requireTenant`, and `MissingIdempotencyPartitionError`
  extends core's `MissingPartitionError`.
- `@nestjs-pipeline/rate-limit`: per-command rate limiting on rate-limiter-flexible,
  applied wherever the command is dispatched from, with an HTTP 429 filter. `keyFactory`
  is required: there is no default bucket. `points` is a fixed or computed cost per
  command; `0` charges nothing.
- `@nestjs-pipeline/resilience`: resilience on cockatiel, in two parts. Named policies
  for outbound dependencies (retry, circuit breaker, timeout, bulkhead, fallback),
  declared in `ResilienceModule.forRoot({ policies })` or `forRootAsync`, built and
  validated at startup, and shared through `ResiliencePolicies` or
  `@InjectResiliencePolicy(name)`. `ResilienceBehavior` applies retry, timeout and
  bulkhead around a whole handler; a circuit breaker or fallback there is a bootstrap
  error. Retry, circuit breaker and fallback require a `handle` predicate or
  `handleAllErrors: true`.
- `@nestjs-pipeline/tenant`: `runWithTenant()` sets the current tenant and
  `currentTenantId()` reads it; `tenantSource` hands the same store to
  `PipelineModule.forRoot({ sources })` and `JobContextModule.forRoot`. It has no
  dependencies.
- `@nestjs-pipeline/job-context`: carries a request's tenant, correlation id and
  principal identity into the queue jobs it enqueues (`withJobContext`, `@InJobContext`),
  re-checked through an application `IJobPrincipal` when the job runs, and gives system
  work an explicit principal and grants per tenant (`@AsSystem`). It reads and restores the
  tenant and correlation id through the `sources` of `JobContextModule.forRoot` and depends
  on no other pipeline package.
- `@cqrs-ddd/core`: framework-neutral DDD building blocks (aggregates, domain events,
  `CommandBaseHandler`, repository contracts, persistence lifecycle decorators that map
  unique violations by entity property through a pluggable persistence dialect
  (`IPersistenceDialect`, `setPersistenceDialect`), a
  revision-fenced repository cache (`CACHE_TOKEN`, with `MemoryCache` for one process), tenant-scoped cache keys, HTTP status mapping, and
  the value rules `textRule` and `numberRule`, which throw an `InvalidValueException` or
  an application's own subclass). It depends on no framework: `CommandBaseHandler` takes
  any `IDomainEventPublisher`, the cache decorators take a `logger`, and cache keys take
  their tenant from a resolver the application registers with `setTenantResolver`.
  It has no peers and no ORM dependency.
- `@cqrs-ddd/mikro-orm`: the MikroORM 7 adapters of `@cqrs-ddd/core` —
  `AggregateRepository`, `optimisticUpdate`, `optimisticDelete`, `assertAutocommit`,
  `MikroOrmDialect` (reads the violated unique constraint from the ORM metadata, for
  PostgreSQL and SQLite), `mapPersistenceError` / `isTransientPersistenceError`,
  `MikroOrmCache` (with `CacheEntrySchema` and `createCacheTableSql` for its table), `TenantStore` (the active tenant's `EntityManager`, with a database or
  a schema per tenant) and `UnixTimestampType`, which throws a `TypeError` for a value with no
  valid time. `@cqrs-ddd/core` and `@mikro-orm/core` are required peers.
- `@cqrs-ddd/uuidv7`: RFC 9562 UUIDv7 generation and validation, with no dependencies.
- `@cqrs-ddd/untyped`: `untyped(value)`, a typed replacement for `as any` that reads
  undeclared properties as `unknown`; no dependencies.
- `@cqrs-ddd/safe-stringify`: a strict, key-sorted serializer for identities and a safe,
  redacting serializer for logs, with the key-segment helpers; no dependencies. Its output
  is frozen, so stored cache keys stay valid.
