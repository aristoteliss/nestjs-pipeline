# @nestjs-pipeline/opentelemetry

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/opentelemetry.svg)](https://www.npmjs.com/package/@nestjs-pipeline/opentelemetry)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/opentelemetry.svg)](https://www.npmjs.com/package/@nestjs-pipeline/opentelemetry)

OpenTelemetry **tracing & metrics** behaviors for `@nestjs-pipeline/core` — auto-create spans **and** record duration/throughput/error metrics for every command, query, and event pipeline invocation, with rich attributes and error recording.

- **`TraceBehavior`** — wraps each handler in an OTel span (via the Trace API).
- **`MetricsBehavior`** — records a latency histogram and an invocation counter (via the Metrics API).

Both are no-op-safe: if the matching SDK isn't initialized, they pass through / record to a no-op meter without errors.

---

## Table of Contents

- [Installation](#installation)
- [Setup](#setup)
  - [1. Initialize the OTel SDK](#1-initialize-the-otel-sdk)
  - [2. Register TraceBehavior](#2-register-tracebehavior)
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
- [No SDK? No Problem.](#no-sdk-no-problem)
- [Full Example](#full-example)
- [API Reference](#api-reference)
- [License](#license)

---

## Installation

```bash
pnpm add @nestjs-pipeline/opentelemetry @opentelemetry/api
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common reflect-metadata
```

You'll also need an OTel SDK and exporter for your backend (e.g. SigNoz, Jaeger, Datadog):

```bash
pnpm add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```

---

## Setup

### 1. Initialize the OTel SDK

The SDK **must** be started before `NestFactory.create()`. The simplest approach is a dedicated `tracing.ts` file imported as the first line of `main.ts`:

```typescript
// tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }),
  serviceName: 'users-api',
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

### 2. Register TraceBehavior

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule, LoggingBehavior } from '@nestjs-pipeline/core';
import { TraceBehavior } from '@nestjs-pipeline/opentelemetry';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      globalBehaviors: {
        scope: 'all',
        before: [LoggingBehavior],
        after: [[TraceBehavior, { tracerName: 'users-api' }]],
      },
    }),
  ],
})
export class AppModule {}
```

That's it — every command, query, and event handler now emits OTel spans automatically.

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

**On success:**

- Span status: `OK`

**On error:**

- Span status: `ERROR` with the exception message
- The exception is recorded on the span via `span.recordException(err)`

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
| `pipeline.handler.invocations` | Counter | — | Number of handler invocations |

### Attributes

Both instruments are tagged with the same **low-cardinality** attributes so they
can be sliced per handler and outcome:

| Attribute | Example Value |
|---|---|
| `pipeline.request.kind` | `command` |
| `pipeline.request.name` | `CreateUserCommand` |
| `pipeline.handler.name` | `CreateUserHandler` |
| `outcome` | `success` \| `failure` |
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
          [TraceBehavior, { tracerName: 'users-api' }],
          [MetricsBehavior, { meterName: 'users-api' }],
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
  serviceName: 'users-api',
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
import { MetricsBehavior } from '@nestjs-pipeline/opentelemetry';

@CommandHandler(ProcessPaymentCommand)
@UsePipeline([MetricsBehavior, { meterName: 'payment-service' }])
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

```promql
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

`TraceBehavior` accepts a custom Nest `LoggerService` via the `LOGGING_BEHAVIOR_LOGGER` token.
This is useful when your app uses `nestjs-pino`.

```typescript
import { Module } from '@nestjs/common';
import { NativeLogger } from 'nestjs-pino';
import { LOGGING_BEHAVIOR_LOGGER } from '@nestjs-pipeline/core';
import { TraceBehavior, MetricsBehavior } from '@nestjs-pipeline/opentelemetry';

@Module({
  providers: [
    TraceBehavior,
    MetricsBehavior,
    { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: NativeLogger },
  ],
})
export class AppModule {}
```

Both behaviors only emit `warn`/`log` messages at startup; how those map to your
transport (e.g. pino levels) is handled entirely by the injected logger.

### Global Tracer Name

Set the tracer name when registering globally — this appears in your APM tool:

```typescript
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    after: [[TraceBehavior, { tracerName: 'users-api' }]],
  },
})
```

### Per-Handler Tracer Name

Override the tracer name for specific handlers using `@UsePipeline`:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { TraceBehavior } from '@nestjs-pipeline/opentelemetry';

@CommandHandler(ProcessPaymentCommand)
@UsePipeline(
  [TraceBehavior, { tracerName: 'payment-service' }],
)
export class ProcessPaymentHandler implements ICommandHandler<ProcessPaymentCommand> {
  async execute(command: ProcessPaymentCommand): Promise<PaymentResult> {
    // This handler's spans will appear under 'payment-service' tracer
    return this.paymentGateway.charge(command);
  }
}
```

If no `tracerName` is provided (neither globally nor per-handler), the default is `'nestjs-pipeline'`.

---

## No SDK? No Problem.

If the OpenTelemetry SDK is **not** initialized (e.g. in development or test environments), both behaviors degrade safely: they do not export telemetry and do not throw because telemetry is unavailable.

- `TraceBehavior` detects the missing tracer provider at module init and **passes through** without creating spans.
- `MetricsBehavior` still performs its normal timing and metric-recording calls, but they target a **no-op meter**, so recordings are silently discarded. This is safe without a metrics pipeline, but it is not a literal zero-overhead path.

A warning is logged once at startup for each:

```
[Nest] WARN [TraceBehavior] OpenTelemetry SDK is NOT initialized — TraceBehavior will pass through without tracing. Ensure your tracing bootstrap runs BEFORE NestFactory.create() (import "./tracing" as the first line of main.ts, or use --require ./tracing.js).
[Nest] WARN [MetricsBehavior] OpenTelemetry metrics SDK is NOT initialized — MetricsBehavior will record to a no-op meter (metrics discarded). Register a MeterProvider with a reader/exporter to export pipeline metrics.
```

When the SDK IS active:

```
[Nest] LOG [TraceBehavior] OpenTelemetry tracer provider is active — spans will be emitted.
[Nest] LOG [MetricsBehavior] OpenTelemetry meter provider is active — pipeline metrics will be exported.
```

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
  serviceName: 'users-api',
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
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ZodValidationFilter());
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
        before: [LoggingBehavior],
        after: [
          [TraceBehavior, { tracerName: 'users-api' }],
          [MetricsBehavior, { meterName: 'users-api' }],
          ZodValidationBehavior,
        ],
      },
    }),
    UsersModule,
  ],
})
export class AppModule {}

// ── create-user.handler.ts ──
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline, LoggingBehavior } from '@nestjs-pipeline/core';

@CommandHandler(CreateUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
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
Trace: users-api
└── command.CreateUserCommand (12.34ms) [OK]
    ├── pipeline.request.kind = "command"
    ├── pipeline.request.name = "CreateUserCommand"
    ├── pipeline.handler.name = "CreateUserHandler"
    ├── pipeline.correlation_id = "019728a3-7f4a-..."
    └── pipeline.started_at = "2026-03-01T12:00:00.000Z"
```

**Plus metrics** (same handler) on the `users-api` meter:

```
pipeline.handler.duration{...,outcome="success"}     histogram → p50/p95/p99 latency
pipeline.handler.invocations{...,outcome="success"} counter   → request & error rate
```

---

## API Reference

| Export | Type | Description |
|---|---|---|
| `TraceBehavior` | Class | Pipeline behavior — creates OTel spans per handler invocation |
| `TraceBehaviorOptions` | Interface | `{ tracerName?: string }` — configure the tracer name |
| `MetricsBehavior` | Class | Pipeline behavior — records duration histogram & invocation counter per handler |
| `MetricsBehaviorOptions` | Interface | `{ meterName?: string }` — configure the meter name |

---

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](../../LICENSE) and [`COMMERCIAL_LICENSE.txt`](../../COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
