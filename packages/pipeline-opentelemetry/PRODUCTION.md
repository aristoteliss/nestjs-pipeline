# Production usage notes

This branch makes `pipeline-opentelemetry` a pipeline observability integration rather than just a span wrapper. It relies on the OpenTelemetry API contract: if no SDK/provider is installed, the API returns no-op tracers/meters. The package does not inspect provider implementation names or private delegates.

## Standard pipeline semantics

Trace spans use stable attributes such as:

```text
pipeline.request.kind
pipeline.request.name
pipeline.handler.name
pipeline.correlation_id
pipeline.tenant_id
pipeline.started_at
pipeline.outcome
error.type
```

Metrics intentionally use a smaller low-cardinality default set: request kind, request name, handler name, outcome, and error type.

## Request-local enrichment

A downstream behavior or handler can add trace attributes without creating extra spans:

```ts
addPipelineTelemetryAttributes(context, {
  'pipeline.cache.hit': false,
  'pipeline.feature.variant': 'treatment',
});
```

`TraceBehavior` reads the bag again after downstream execution, so attributes discovered later in the pipeline are included in the request span.

For package-to-package integration, keep add-ons independent: they should expose decisions through `PipelineContext`; the application (or a small integration behavior) can translate those decisions into telemetry attributes. Do not make cache/idempotency/feature-flag packages depend on OpenTelemetry.

This means installing the add-ons produces no feature, cache, idempotency,
rate-limit or dead-letter attributes on its own — the application supplies the
join. `api/src/infrastructure/behaviors/telemetry-bridge.behavior.ts`
is a complete reference implementation: register it inside `TraceBehavior` and
outside the add-ons, annotate on unwind, write nothing for an item that is
absent, and keep unbounded values such as cache keys out of the attributes.

## Metrics and cardinality

The package records:

```text
pipeline.handler.duration     histogram (ms)
pipeline.handler.invocations  counter
pipeline.handler.active       up/down counter
```

Request-local telemetry attributes are **not** copied to metric labels by default. Correlation IDs, user IDs, raw tenant values, request parameters, and arbitrary feature values can create unbounded time-series cardinality.

Only set `includeContextAttributes: true` when the context bag is deliberately bounded, or use `attributeFactory` to select a safe label set.

## Failure behavior

Observability must not change the business outcome:

- attribute factory failures fall open;
- meter/instrument creation failures fall open;
- metric recording failures fall open;
- tracing records the business exception and rethrows the original error unchanged.

Use `recordException: false` only when another layer already records exceptions or policy requires avoiding exception details in telemetry.

## Span volume

The default remains one span around the handler pipeline. This branch deliberately does not create a span for every behavior because that often creates trace noise and ingestion cost. Add child spans only for operations that have useful independent latency/failure semantics.
