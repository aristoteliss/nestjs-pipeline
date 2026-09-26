# Changelog

## 0.2.0 (unreleased)

Every package is released at 0.2.0. Five were on npm before; eleven are released for the
first time.

### Requirements for every package

- Node.js 22 or later (`engines`).
- NestJS 11 for every `@nestjs-pipeline/*` package. NestJS 10 is no longer supported.
- Packages that peer on `@nestjs-pipeline/core` require `^0.2.0` of it instead of any
  version.

### Upgrading from 0.1.x

#### `@nestjs-pipeline/core` (from 0.1.18)

Breaking:

- Peers are `@nestjs/common`, `@nestjs/core` and `@nestjs/cqrs` `^11.0.0`.
- Removed from the public API: `PipelineBootstrapService`, `PIPELINE_MODULE_OPTIONS`,
  `PIPELINE_OPTIONS_REGISTRY`, `clearPipelineOptionsRegistry`, `SET_RESPONSE` and
  `SET_ORIGINAL_CORRELATION_ID`. Configure the pipeline through `PipelineModule.forRoot`
  or `forRootAsync`; a behavior can no longer set a context's response or original
  correlation ID.
- A context's tenant id is write-once: assigning it again throws.
- When several NestJS applications in one process wrap the same handler class, calling it
  on an instance that none of them created throws, instead of running without any
  pipeline.
- `LoggingBehavior` masks sensitive fields in logged payloads by default
  (`redactSensitiveKeys: true`, using `DEFAULT_REDACT_KEYS`). Key matching ignores case,
  `_` and `-`, so `refreshToken` also masks `refresh_token`. `excludeKeys` also applies to
  the properties of cloned `Error` objects and to `Map` keys.

Added:

- `PipelineModule.forRootAsync` (`PipelineModuleAsyncOptions`, `PipelineOptionsFactory`,
  `PipelineRuntimeOptions`), `PipelineModuleFeatureOptions`, the `logging()` intent
  helper and `@SkipPipeline`.
- Pipeline items: `createPipelineItem`, `getPipelineItem`, `setPipelineItem`,
  `hasPipelineItem`, `requirePipelineItem`, `MissingPipelineItemError`.
- Behavior contracts and bootstrap diagnostics: `PIPELINE_BEHAVIOR_CONTRACT`,
  `PipelineConfigurationError` and their types.
- `SET_TENANT_ID`, `toPostgresJson`.
- The serializers and key-segment helpers (`stableStringify`, `toStrictJsonValue`,
  `safeStringify`, `safeSanitize`, `redactValue`, `DEFAULT_REDACT_KEYS`, `REDACTED`,
  `joinKeySegments`, `escapeKeySegment`, `ABSENT_SEGMENT`), re-exported from
  `@cqrs-ddd/safe-stringify`.

Same API and output: `uuidv7` and `isUuidV7` now come from `@cqrs-ddd/uuidv7`, and the
serializers above from `@cqrs-ddd/safe-stringify`. Both are installed as dependencies.

#### `@nestjs-pipeline/correlation` (from 0.1.8)

Breaking:

- New required peer: `@nestjs-pipeline/core` `^0.2.0`. `@nestjs/common` `^11.0.0`.
- `setCorrelationFallback` is no longer exported.
- An incoming correlation ID longer than 128 characters, or not matching
  `DEFAULT_CORRELATION_ID_PATTERN`, is discarded and replaced by a locally generated ID.

Added: `DEFAULT_CORRELATION_HEADER`, `DEFAULT_CORRELATION_ID_MAX_LENGTH`,
`DEFAULT_CORRELATION_ID_PATTERN`, `correlationPipelineOptions()`.

Same API and output: `uuidv7` now comes from `@cqrs-ddd/uuidv7`.

#### `@nestjs-pipeline/opentelemetry` (from 0.1.8)

Breaking: `@nestjs/common` `^11.0.0`; `@nestjs-pipeline/core` `^0.2.0`.

- A tracer, a meter or an enrichment callback that throws never replaces the handler's
  result or error, and never runs the handler twice.

Added: `MetricsBehavior` and `metrics()`, `trace()`, `buildTraceAttributes`,
`buildMetricAttributes`, `addPipelineTelemetryAttributes`,
`getPipelineTelemetryAttributes`, `PIPELINE_OTEL_ATTRIBUTES`,
`PIPELINE_TELEMETRY_ATTRIBUTES` and their types.

#### `@nestjs-pipeline/zod` (from 0.1.6)

Breaking:

- Peers: `zod` `^4.3.0` (was `^4.0.0`), `@nestjs/common` `^11.0.0`,
  `@nestjs-pipeline/core` `^0.2.0`.
- `ZOD_SCHEMA`, the deprecated alias, is removed; use `ZOD_SCHEMA_KEY`.

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
- A rule condition whose placeholder resolves to an object throws, because CASL would
  read the object as query operators.

Added: `requires()`, `CaslAuthorizer` (`can`, `authorize`, `project`),
`UnauthorizedActionException` and `UnauthorizedActionFilter` (HTTP 403),
`getCaslAbility`, `getCaslPrincipal`, `hasEntityConditions`, `CASL_PERMISSION_SOURCE`,
`CASL_PRINCIPAL_KEY`, `CASL_BEHAVIOR_ID`, `CASL_ACTIONS`, `CASL_SUBJECTS` and their types.

### First releases

- `@nestjs-pipeline/audit`: records every audited request, on success and failure, to an
  `AuditSink` (console by default, Postgres bundled), with payload redaction. With the
  default `failOpen: true`, a sink failure is logged and the request's outcome is kept.
  With `failOpen: false`, a sink failure fails a successful request; if the handler had
  already failed, its own error is rethrown unchanged and the sink failure is logged.
- `@nestjs-pipeline/cache`: read-through caching for queries on cache-manager 7 and Keyv.
  `key` is required: there is no default key.
- `@nestjs-pipeline/deadletter`: captures failed commands and events through a
  `DeadLetterTransport` (BullMQ, RabbitMQ and Postgres bundled). The RabbitMQ transport is
  tested with a mocked channel only.
- `@nestjs-pipeline/feature-flags`: gates handlers through OpenFeature.
  `FeatureDisabledFilter` answers HTTP 403.
- `@nestjs-pipeline/idempotency`: concurrent-duplicate exclusion and replay of successful
  responses, with memory (default), Redis and Postgres stores. A failed execution releases
  its key by default. The Postgres store keeps responses as JSON text, so every response,
  including one with NUL characters or unpaired surrogates, replays exactly.
- `@nestjs-pipeline/rate-limit`: rate limiting on rate-limiter-flexible, with an HTTP 429
  filter. `keyFactory` is required: there is no default bucket.
- `@nestjs-pipeline/resilience`: retry, circuit breaker, timeout, bulkhead and fallback on
  cockatiel. Retry, circuit breaker and fallback require a `handle` predicate or
  `handleAllErrors: true`.
- `@nestjs-pipeline/tenant`: `currentTenantId()` returns the tenant of the running
  pipeline or of the innermost `runWithTenant()` scope.
- `@cqrs-ddd/core`: framework-neutral DDD building blocks (aggregates, domain events,
  `CommandBaseHandler`, repository contracts, MikroORM persistence decorators, a
  revision-fenced repository cache, tenant-scoped cache keys, HTTP status mapping, and
  the value rules `textRule` and `numberRule`, which throw an `InvalidValueException` or
  an application's own subclass). It depends on no framework: `CommandBaseHandler` takes
  any `IDomainEventPublisher`, the cache decorators take a `logger`, and cache keys take
  their tenant from a resolver the application registers with `setTenantResolver`.
  `UnixTimestampType` throws a `TypeError` for a value with no valid time.
  `@mikro-orm/core` 7 is an optional peer, needed only for `/persistence`.
- `@cqrs-ddd/uuidv7`: RFC 9562 UUIDv7 generation and validation, with no dependencies.
- `@cqrs-ddd/safe-stringify`: a strict, key-sorted serializer for identities and a safe,
  redacting serializer for logs, with the key-segment helpers; no dependencies. Its output
  is frozen, so stored cache keys stay valid.
