---
title: "@nestjs-pipeline/opentelemetry"
description: "OpenTelemetry tracing & metrics behaviors for @nestjs-pipeline/core"
editUrl: false
---
[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/opentelemetry.svg)](https://www.npmjs.com/package/@nestjs-pipeline/opentelemetry)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/opentelemetry.svg)](https://www.npmjs.com/package/@nestjs-pipeline/opentelemetry)

OpenTelemetry **tracing & metrics** behaviors for `@nestjs-pipeline/core` — auto-create spans **and** record duration/throughput/error metrics for every command, query, and event pipeline invocation, with rich attributes and error recording.

- **`TraceBehavior`** — wraps each handler in an OTel span (via the Trace API).
- **`MetricsBehavior`** — records a latency histogram and an invocation counter (via the Metrics API).

Both are no-op-safe: if the matching SDK isn't initialized, the OpenTelemetry API supplies no-op telemetry implementations, so handlers continue normally and telemetry is silently discarded.

---

## Table of Contents

- [Installation](#installation)
- [Setup](#setup)
  - [1. Initialize the OTel SDK](#1-initialize-the-otel-sdk)
  - [2. Register Telemetry Providers](#2-register-telemetry-providers)
- [Span Details](#span-details)
- [Metrics](#metrics)
  - [Instruments](#instruments)
  - [Attributes](#attributes)
  - [Registering MetricsBehavior](#registering-metricsbehavior)
  - [Custom Meter Name](#custom-meter-name)
  - [Example Queries](#example-queries)
- [Configuration](#configuration)
  - [Custom Logger](#custom-logger)
  - [Global Tracer Name](#global-tracer-name)
  - [Per-Handler Tracer Name](#per-handler-tracer-name)
  - [Span Name and Custom Attributes](#span-name-and-custom-attributes)
  - [Disabling Telemetry for a Handler](#disabling-telemetry-for-a-handler)
  - [Request-Local Attributes](#request-local-attributes)
  - [Attributes from Other Behaviors](#attributes-from-other-behaviors)
  - [Tenant and Correlation Attributes](#tenant-and-correlation-attributes)
- [Instrumentation failure boundaries](#instrumentation-failure-boundaries)
- [No SDK? No Problem.](#no-sdk-no-problem)
- [Full Example](#full-example)
- [Migrating from 0.1.x](#migrating-from-01x)
- [API Reference](#api-reference)
- [License](#license)

---

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-opentelemetry @cqrs-ddd/nestjs @cqrs-ddd/pipeline @nestjs/cqrs @opentelemetry/api
```

**Peer dependencies:**

```bash
pnpm add @nestjs/common @nestjs/core reflect-metadata
```

Requires Node.js 22.12 or later, `@nestjs/common` `^12.1.0` and `@opentelemetry/api` `^1.9.0`.

You'll also need an OTel SDK and exporter for your backend (e.g. SigNoz, Jaeger, Datadog):

```bash
pnpm add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```

---

## Setup

### 1. Initialize the OTel SDK

The SDK **must** be started before `NestFactory.create()` if you want telemetry to be exported. The simplest approach is a dedicated `tracing.ts` file imported as the first line of `main.ts`:

```typescript
// tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }),
  serviceName: 'my-service',
});

sdk.start();
```

```typescript
// main.ts
import './tracing'; // ← MUST be the first import
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

### 2. Register Telemetry Providers

In your application or observability module, register `TraceBehavior`, `MetricsBehavior`, and `AttributesBehavior` as providers and place them in the global pipeline:

```typescript
// observability.module.ts
import { Module, Logger } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule } from '@cqrs-ddd/nestjs';
import { LoggingBehavior, logging } from '@cqrs-ddd/pipeline';
import {
  TraceBehavior,
  MetricsBehavior,
  AttributesBehavior,
} from '@cqrs-ddd/pipeline-opentelemetry';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      globalBehaviors: [
        {
          scope: 'all',
          before: [
            logging(),
            [TraceBehavior, { tracerName: 'my-service' }],
            [MetricsBehavior, { meterName: 'my-service' }],
            AttributesBehavior,
          ],
        },
      ],
    }),
  ],
  providers: [
    LoggingBehavior,
    TraceBehavior,
    {
      provide: MetricsBehavior,
      useFactory: () => new MetricsBehavior(new Logger(MetricsBehavior.name)),
    },
    AttributesBehavior,
  ],
})
export class ObservabilityModule {}
```

That's it — every command, query, and event handler now emits OTel spans automatically when a tracer provider is installed; otherwise the Trace API uses its no-op tracer.

---

## Span Details

Each span includes the following:

| Field | Example Value |
|---|---|
| **Span name** | `command.CreateUserCommand` |
| **Span kind** | `INTERNAL` |
| `pipeline.request.kind` | `command` |
| `pipeline.request.name` | `CreateUserCommand` |
| `pipeline.handler.name` | `CreateUserHandler` |
| `pipeline.correlation_id` | `019728a3-7f4a-7b3e-8a1d-...` |
| `pipeline.started_at` | `2026-03-01T12:00:00.000Z` |
| `pipeline.tenant_id` | `acme` _(only when the pipeline has a tenant)_ |
| `pipeline.outcome` | `success` \| `failure` _(set when the handler ends)_ |
| `error.type` | `ZodValidationError` _(failures only; `err.name`, or `unknown` for non-`Error` values)_ |

Attributes added through `addPipelineTelemetryAttributes()` and returned by
`attributeFactory` are also applied (see [Configuration](#configuration)).

**On success:**

- Span status: `OK`

**On error:**

- Span status: `ERROR` with the exception message
- The exception is recorded on the span via `span.recordException(err)` (disable with `recordException: false`)
- The original error is rethrown unchanged

---

## Metrics

`MetricsBehavior` records OpenTelemetry **metrics** via the Metrics API,
complementing the spans emitted by `TraceBehavior`. From these two instruments
you can derive **throughput**, **error-rate**, and **latency percentiles**
(p50/p95/p99) per handler.

### Instruments

| Instrument | Type | Unit | Description |
|---|---|---|---|
| `pipeline.handler.duration` | Histogram | `ms` | Handler execution time |
| `pipeline.handler.invocations` | Counter | — | Number of completed handler invocations |
| `pipeline.handler.active` | UpDownCounter | — | Handlers currently executing |

### Attributes

`pipeline.handler.active` carries only the request kind, request name and
handler name. The duration and invocation instruments are tagged with the same **low-cardinality** attributes so they
can be sliced per handler and outcome:

| Attribute | Example Value |
|---|---|
| `pipeline.request.kind` | `command` |
| `pipeline.request.name` | `CreateUserCommand` |
| `pipeline.handler.name` | `CreateUserHandler` |
| `outcome` | `success` \| `failure` |
| `pipeline.outcome` | `success` \| `failure` _(same value, namespaced)_ |
| `error.type` | `ZodValidationError` _(failures only — `err.name`)_ |

> **Why no `correlation_id` / `started_at`?** Unlike spans, metric attributes
> become time-series dimensions. High-cardinality values (correlation ids,
> timestamps) would explode your series count — they belong on spans, not
> metrics. `error.type` uses `err.name`, which is bounded.

### Registering MetricsBehavior

Register it alongside `TraceBehavior` (typically in the `after` group):

```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule, LoggingBehavior } from '@nestjs-pipeline/core';
import { TraceBehavior, MetricsBehavior } from '@nestjs-pipeline/opentelemetry';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      globalBehaviors: {
        scope: 'all',
        before: [LoggingBehavior],
        after: [
          [TraceBehavior, { tracerName: 'my-service' }],
          [MetricsBehavior, { meterName: 'my-service' }],
        ],
      },
    }),
  ],
})
export class AppModule {}
```

You'll also need a **metrics** exporter wired into your SDK (in addition to the
trace exporter), e.g.:

```typescript
// tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const sdk = new NodeSDK({
  serviceName: 'my-service',
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: 'http://localhost:4318/v1/metrics',
    }),
  }),
});

sdk.start();
```

### Custom Meter Name

Like `tracerName`, the `meterName` can be set globally or overridden
per-handler via `@UsePipeline`:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { metrics } from '@nestjs-pipeline/opentelemetry';

@CommandHandler(ProcessPaymentCommand)
@UsePipeline(metrics({ meterName: 'payment-service' }))
export class ProcessPaymentHandler
  implements ICommandHandler<ProcessPaymentCommand>
{
  async execute(command: ProcessPaymentCommand): Promise<PaymentResult> {
    // This handler's metrics are recorded on the 'payment-service' meter
    return this.paymentGateway.charge(command);
  }
}
```

If no `meterName` is provided (neither globally nor per-handler), the default is
`'nestjs-pipeline'`.

### Example Queries

With an OTLP → Prometheus pipeline, the instruments map to time series you can
query directly:

```text
# Request rate per handler (req/s)
sum by (pipeline_handler_name) (rate(pipeline_handler_invocations_total[1m]))

# Error rate per handler
sum by (pipeline_handler_name) (
  rate(pipeline_handler_invocations_total{outcome="failure"}[5m])
)

# p95 latency per handler
histogram_quantile(
  0.95,
  sum by (le, pipeline_handler_name) (
    rate(pipeline_handler_duration_bucket[5m])
  )
)
```

> Exact metric/label names depend on your exporter's naming conventions (the
> Prometheus exporter, for example, lowercases dots to underscores and appends
> `_total` to counters).

---

## Configuration

### Custom Logger

`MetricsBehavior` optionally injects a Nest `LoggerService` through the `LOGGING_BEHAVIOR_LOGGER` token and uses it only to report instrumentation failures (a `warn` when instruments cannot be created, a `debug` when a recording fails). It logs nothing at startup. `TraceBehavior` injects no logger.

```typescript
import { Module } from '@nestjs/common';
import { NativeLogger } from 'nestjs-pino';
import { LOGGING_BEHAVIOR_LOGGER } from '@nestjs-pipeline/core';
import { MetricsBehavior } from '@nestjs-pipeline/opentelemetry';

@Module({
  providers: [
    MetricsBehavior,
    { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: NativeLogger },
  ],
})
export class AppModule {}
```

Without a bound logger, instrumentation failures are swallowed silently.

### Global Tracer Name

Set the tracer name when registering globally — this appears in your APM tool:

```typescript
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    after: [[TraceBehavior, { tracerName: 'my-service' }]],
  },
})
```

### Per-Handler Tracer Name

Override the tracer name for specific handlers using `@UsePipeline`:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { trace } from '@nestjs-pipeline/opentelemetry';

@CommandHandler(ProcessPaymentCommand)
@UsePipeline(trace({ tracerName: 'payment-service' }))
export class ProcessPaymentHandler implements ICommandHandler<ProcessPaymentCommand> {
  async execute(command: ProcessPaymentCommand): Promise<PaymentResult> {
    // This handler's spans will appear under 'payment-service' tracer
    return this.paymentGateway.charge(command);
  }
}
```

If no `tracerName` is provided (neither globally nor per-handler), the default is `'nestjs-pipeline'`.

### Span Name and Custom Attributes

`spanName` accepts a string or a function of the pipeline context. An empty
result, or a function that throws, falls back to `{requestKind}.{requestName}`.
`attributeFactory` may be synchronous or asynchronous; if it throws, the default
attributes are kept.

```typescript
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { metrics, trace } from '@nestjs-pipeline/opentelemetry';

@QueryHandler(GetInvoiceQuery)
@UsePipeline(
  trace({
    spanName: (ctx) => `billing.${ctx.requestName}`,
    attributeFactory: async () => ({
      'billing.region': process.env.REGION ?? 'unknown',
    }),
  }),
  metrics({
    // Metric labels must stay bounded: no ids, emails or raw request values.
    attributeFactory: () => ({ 'app.operation': 'invoice.read' }),
  }),
)
export class GetInvoiceHandler implements IQueryHandler<GetInvoiceQuery> {
  async execute(query: GetInvoiceQuery): Promise<Invoice> {
    return this.invoices.get(query.invoiceId);
  }
}
```

### Disabling Telemetry for a Handler

When the behaviors are registered globally, `enabled: false` skips them for one
hot or noisy handler without removing the global registration:

```typescript
@QueryHandler(HealthCheckQuery)
@UsePipeline(trace({ enabled: false }), metrics({ enabled: false }))
export class HealthCheckHandler implements IQueryHandler<HealthCheckQuery> {
  async execute(): Promise<string> {
    return 'ok';
  }
}
```

### Request-Local Attributes

A downstream behavior or the handler can enrich the request span without
creating a child span. `TraceBehavior` reads the bag before and again after
execution, so attributes added late still reach the span. Set
`includeContextAttributes: false` on `trace()` to ignore the bag.

```typescript
import { Injectable } from '@nestjs/common';
import type {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@nestjs-pipeline/core';
import { addPipelineTelemetryAttributes } from '@nestjs-pipeline/opentelemetry';

@Injectable()
export class VariantBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate): Promise<unknown> {
    addPipelineTelemetryAttributes(context, { 'app.variant': 'treatment' });
    return next();
  }
}
```

`getPipelineTelemetryAttributes(context)` returns a copy of the bag. The bag is
**not** copied to metric labels unless `metrics({ includeContextAttributes: true })`
is set; enable that only when every value in the bag is bounded.

### Attributes from Other Behaviors

Behaviors that take no telemetry dependency publish their decisions as
`context.items` entries, and their packages export a factory that turns those
entries into attributes. `AttributesBehavior` runs the factories once the rest of
the chain has finished, successfully or not, and adds the result to the bag, so
`TraceBehavior` puts it on the span and `MetricsBehavior` on its labels when
`includeContextAttributes` is on. Register it inside `TraceBehavior` and
`MetricsBehavior` and outside the behaviors it describes:

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
          buildFeatureFlagAttributes,
          buildCacheAttributes,
          buildIdempotencyAttributes,
          buildRateLimitAttributes,
          buildDeadLetterAttributes,
        ],
      }],
    ],
  },
});
```

| Factory | Package | Attributes |
| --- | --- | --- |
| `buildFeatureFlagAttributes` | `@nestjs-pipeline/feature-flags` | `feature_flag.key`, `feature_flag.enabled`; `feature_flag.variant`, `feature_flag.reason` and `feature_flag.error_code` when reported |
| `buildCacheAttributes` | `@nestjs-pipeline/cache` | `cache.hit` |
| `buildIdempotencyAttributes` | `@nestjs-pipeline/idempotency` | `idempotency.replayed`; `idempotency.ownership_lost` when the claim was lost |
| `buildRateLimitAttributes` | `@nestjs-pipeline/rate-limit` | `rate_limit.remaining_points` |
| `buildDeadLetterAttributes` | `@nestjs-pipeline/deadletter` | `dead_letter.captured` when a record was delivered |

A factory returns nothing for a behavior that did not run, so a request without
caching carries no `cache.hit` rather than a false miss, and no factory includes a
cache, idempotency or rate-limit key, since those carry tenants and principals.
Factories run in order and a later one wins on a shared name; one that throws or
rejects adds nothing, the others still apply, and the request's result or error
is returned unchanged.

Choose the factories you want, and wrap one to rename or drop attributes:

```typescript
const cacheHit: PipelineTelemetryAttributeFactory = (context) => {
  const { 'cache.hit': hit } = buildCacheAttributes(context);
  return hit === undefined ? {} : { 'app.cache_hit': hit };
};
```

`rate_limit.remaining_points` takes as many values as the limiter has points; keep
it out of metric labels unless that cardinality is acceptable.

### Tenant and Correlation Attributes

`pipeline.correlation_id` and `pipeline.tenant_id` come from the pipeline
context. Configure where the pipeline takes them from with `sources` on
`PipelineModule.forRoot()`:

```typescript
import { PipelineModule } from '@nestjs-pipeline/core';
import { correlationSource } from '@nestjs-pipeline/correlation';
import { tenantSource } from '@nestjs-pipeline/tenant';
import { TraceBehavior } from '@nestjs-pipeline/opentelemetry';

PipelineModule.forRoot({
  sources: { tenantId: tenantSource, correlationId: correlationSource },
  globalBehaviors: { scope: 'all', before: [TraceBehavior] },
});
```

Both values are span attributes only. They are never metric labels by default,
because they are unbounded.

---

## Instrumentation failure boundaries

Span enrichment, status, exception recording, span completion, metric recording,
and diagnostic logging are best-effort. Failures in these guarded operations
do not replace the handler result or its original error. This describes the
package call boundaries; it does not guarantee exporter delivery or protect
against arbitrary asynchronous failures inside an SDK.

## No SDK? No Problem.

If the OpenTelemetry SDK is **not** initialized (for example in development or tests), both behaviors remain safe because the OpenTelemetry API provides no-op implementations.

- `TraceBehavior` always calls the public Trace API. Without a registered tracer provider, `trace.getTracer()` returns the API's no-op tracer; span operations are discarded and the wrapped handler still executes normally.
- `MetricsBehavior` performs its normal timing and metric-recording calls against a no-op meter, so recordings are silently discarded.

Neither behavior logs a startup message about SDK readiness.

`TraceBehavior` deliberately does **not** inspect provider implementation details such as `ProxyTracerProvider.getDelegate()`, `getDelegateTracer()`, or `constructor.name`. Those are implementation details rather than the public readiness contract and can change across OpenTelemetry versions.

If you want to skip even the no-op API calls for a particular handler, set `enabled: false` in `TraceBehaviorOptions` or `MetricsBehaviorOptions`.

---

## Full Example

```typescript
// ── tracing.ts ──
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: 'my-service',
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: 'http://localhost:4318/v1/metrics',
    }),
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// ── main.ts ──
import './tracing';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ZodValidationFilter(app.get(HttpAdapterHost)));
  await app.listen(3000);
}
bootstrap();

// ── app.module.ts ──
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule, LoggingBehavior } from '@nestjs-pipeline/core';
import { TraceBehavior, MetricsBehavior } from '@nestjs-pipeline/opentelemetry';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      globalBehaviors: {
        scope: 'all',
        before: [LoggingBehavior, ZodValidationBehavior],
        after: [
          [TraceBehavior, { tracerName: 'my-service' }],
          [MetricsBehavior, { meterName: 'my-service' }],
        ],
      },
    }),
    UsersModule,
  ],
})
export class AppModule {}

// create-user.handler.ts
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline, logging } from '@nestjs-pipeline/core';

@CommandHandler(CreateUserCommand)
@UsePipeline(logging({ requestResponseLogLevel: 'log' }))
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand): Promise<User> {
    // This handler is now:
    // 1. Logged   (global LoggingBehavior + handler override)
    // 2. Traced   (global TraceBehavior → span: command.CreateUserCommand)
    // 3. Measured (global MetricsBehavior → duration histogram + invocation counter)
    // 4. Parsed/validated (global ZodValidationBehavior → applies successful schema output to the request)
    return this.userRepository.create(command.username, command.email);
  }
}
```

**Result in your APM tool (e.g. SigNoz, Jaeger):**

```
Trace: my-service
└── command.CreateUserCommand (12.34ms) [OK]
    ├── pipeline.request.kind = "command"
    ├── pipeline.request.name = "CreateUserCommand"
    ├── pipeline.handler.name = "CreateUserHandler"
    ├── pipeline.correlation_id = "019728a3-7f4a-..."
    ├── pipeline.started_at = "2026-03-01T12:00:00.000Z"
    └── pipeline.outcome = "success"
```

**Plus metrics** (same handler) on the `my-service` meter:

```
pipeline.handler.duration{...,outcome="success"}     histogram → p50/p95/p99 latency
pipeline.handler.invocations{...,outcome="success"} counter   → request & error rate
```

---

## Migrating from 0.1.x

These steps lead to 0.2.0. To reach 0.4.0, continue with [Upgrading from 0.2.x](/nestjs-pipeline/upgrading/from-0-2/) and
[Upgrading from 0.3.x](/nestjs-pipeline/upgrading/from-0-3/) in the repository README.

0.1.x exported only `TraceBehavior` and `TraceBehaviorOptions`. Everything else
listed in the [API Reference](#api-reference) is new in 0.2.0.

### Peer dependencies and runtime

| | 0.1.x | 0.2.0 |
|---|---|---|
| `@nestjs/common` | `^10.0.0 \|\| ^11.0.0` | `^11.0.0` |
| `@nestjs-pipeline/core` | `*` | `^0.2.0` |
| Node.js | not declared | `>=22.0.0` |

```bash
pnpm add @nestjs-pipeline/opentelemetry@^0.2.0 @nestjs-pipeline/core@^0.2.0 @nestjs/common@^11
```

### `TraceBehaviorOptions` is a type-only export

In 0.1.x it was re-exported without the `type` modifier. It is now exported as
a type, so import it with `import type` under `isolatedModules` or
`verbatimModuleSyntax`:

```typescript
// 0.1.x
import { TraceBehavior, TraceBehaviorOptions } from '@nestjs-pipeline/opentelemetry';

// 0.2.0
import { TraceBehavior, type TraceBehaviorOptions } from '@nestjs-pipeline/opentelemetry';
```

### `TraceBehavior` no longer checks SDK readiness or logs

In 0.1.x, `TraceBehavior` implemented `OnModuleInit`, injected
`LOGGING_BEHAVIOR_LOGGER`, logged a startup `warn`/`log` about SDK readiness and
skipped span creation when it detected no SDK delegate. In 0.2.0 it has no
constructor dependencies, no `onModuleInit()`, and always calls the public Trace
API (a no-op tracer discards spans when no SDK is registered).

```typescript
// 0.1.x: bound only so TraceBehavior's startup message used pino
@Module({
  providers: [
    TraceBehavior,
    { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: NativeLogger },
  ],
})
export class AppModule {}

// 0.2.0: TraceBehavior ignores the token; keep the binding only if
// LoggingBehavior or MetricsBehavior uses it
@Module({
  providers: [TraceBehavior],
})
export class AppModule {}
```

Code or tests that called `traceBehavior.onModuleInit()`, or asserted the
"OpenTelemetry SDK is NOT initialized" warning, must drop those calls. To skip
tracing for a handler, use `enabled: false` instead of relying on SDK detection:

```typescript
// 0.2.0
@UsePipeline(trace({ enabled: false }))
export class HealthCheckHandler {}
```

### Span attributes and failure handling

Spans keep the 0.1.x name and attributes, and add `pipeline.tenant_id` (when
present), `pipeline.outcome` and `error.type`. Dashboards or span processors
that match an exact attribute set should account for them. A tracer or
enrichment callback that throws no longer fails the request: the handler runs
once, untraced if needed, and its own result or error is returned.

### Adopting the tuple helpers

Tuple registration still works. The `trace()` helper is an equivalent, typed
form:

```typescript
// 0.1.x
@UsePipeline([TraceBehavior, { tracerName: 'payment-service' }])

// 0.2.0 (either form)
@UsePipeline([TraceBehavior, { tracerName: 'payment-service' }])
@UsePipeline(trace({ tracerName: 'payment-service' }))
```

---

## API Reference

| Export | Type | Description |
|---|---|---|
| `TraceBehavior` | Class | Pipeline behavior — creates OTel spans per handler invocation; uses the API no-op tracer when no SDK is registered |
| `TraceBehaviorOptions` | Interface | `tracerName`, `enabled`, `spanName`, `attributeFactory`, `recordException`, `includeContextAttributes` (default `true`) |
| `trace` | Function | Typed intent builder returning `[TraceBehavior, options]` for `@UsePipeline` |
| `TraceIntentOptions` | Type | Alias for `TraceBehaviorOptions` |
| `MetricsBehavior` | Class | Pipeline behavior — records duration histogram, invocation counter and in-flight counter per handler |
| `MetricsBehaviorOptions` | Interface | `meterName`, `enabled`, `attributeFactory`, `includeContextAttributes` (default `false`) |
| `metrics` | Function | Typed intent builder returning `[MetricsBehavior, options]` for `@UsePipeline` |
| `MetricsIntentOptions` | Type | Alias for `MetricsBehaviorOptions` |
| `AttributesBehavior` | Class | Pipeline behavior — adds the attributes of the configured factories to the bag after the chain has run |
| `AttributesBehaviorOptions` | Interface | `factories` — attribute factories, applied in order |
| `addPipelineTelemetryAttributes` | Function | Merges attributes into the request-local telemetry bag |
| `getPipelineTelemetryAttributes` | Function | Returns a copy of the request-local telemetry bag |
| `buildTraceAttributes` | Function | Default span attributes for a pipeline context |
| `buildMetricAttributes` | Function | Default low-cardinality metric attributes (kind, request name, handler name) |
| `PIPELINE_OTEL_ATTRIBUTES` | Constant | Attribute names emitted by this package |
| `PIPELINE_TELEMETRY_ATTRIBUTES` | Symbol | `Symbol.for` key of the request-local bag in `context.items` |
| `PipelineTelemetryAttributeFactory` | Type | `(context) => Attributes \| Promise<Attributes>` |

---

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) for details.
