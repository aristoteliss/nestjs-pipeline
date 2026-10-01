---
title: "Tracing and metrics"
---

Auto-creates **spans** (`TraceBehavior`) and records **metrics** (`MetricsBehavior`) for every pipeline invocation with full context attributes.

## Setup

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

## Span Details

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

## Metrics

`MetricsBehavior` records two instruments via the OTel **Metrics API** — derive throughput, error-rate, and latency percentiles per handler:

| Instrument | Type | Unit | Attributes |
|---|---|---|---|
| `pipeline.handler.duration` | Histogram | `ms` | `pipeline.request.kind/name`, `pipeline.handler.name`, `outcome` |
| `pipeline.handler.invocations` | Counter | — | + `error.type` on failures |

Metric attributes are intentionally **low-cardinality** (no `correlation_id`/`started_at`, which would explode time-series count — those live on spans).

## No SDK? No Problem.

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
