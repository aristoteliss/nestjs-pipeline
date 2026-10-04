---
title: "Tracing και metrics"
---

Δημιουργεί αυτόματα **spans** (`TraceBehavior`) και καταγράφει **metrics** (`MetricsBehavior`) για κάθε εκτέλεση του pipeline με πλήρη γνωρίσματα (attributes) context.

## Ρύθμιση <a id="setup"></a>

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

## Λεπτομέρειες Spans <a id="span-details"></a>

Κάθε span περιλαμβάνει:

| Πεδίο | Παράδειγμα |
|---|---|
| **Όνομα span** | `command.CreateUserCommand` |
| `pipeline.request.kind` | `command` |
| `pipeline.request.name` | `CreateUserCommand` |
| `pipeline.handler.name` | `CreateUserHandler` |
| `pipeline.correlation_id` | `019728a3-...` |
| `pipeline.started_at` | `2026-03-01T12:00:00.000Z` |
| **Status** | `OK` σε επιτυχία, `ERROR` με καταγεγραμμένη εξαίρεση |

## Metrics <a id="metrics"></a>

Το `MetricsBehavior` καταγράφει δύο instruments μέσω του OTel **Metrics API** — εξάγοντας throughput, ποσοστό σφαλμάτων (error-rate), και εκατοστημόρια καθυστέρησης (latency percentiles) ανά handler:

| Instrument | Τύπος | Μονάδα | Attributes |
|---|---|---|---|
| `pipeline.handler.duration` | Histogram | `ms` | `pipeline.request.kind/name`, `pipeline.handler.name`, `outcome` |
| `pipeline.handler.invocations` | Counter | — | + `error.type` σε αποτυχίες |

Τα attributes των μετρήσεων έχουν σκόπιμα **χαμηλή πληθικότητα (low-cardinality)** (χωρίς `correlation_id`/`started_at`, κάτι που θα εκτόξευε το πλήθος των χρονοσειρών — αυτά βρίσκονται στα spans).

## Χωρίς SDK; Κανένα πρόβλημα. <a id="no-sdk-no-problem"></a>

Εάν το OpenTelemetry SDK δεν έχει αρχικοποιηθεί, και τα δύο behaviors παραμένουν ασφαλή:
Το `TraceBehavior` διέρχεται (passes through) χωρίς spans, ενώ το `MetricsBehavior` εξακολουθεί να εκτελεί τις κανονικές του κλήσεις χρονισμού και καταγραφής μετρήσεων έναντι ενός no-op meter, επομένως οι καταγραφές απορρίπτονται. Η μη διαθεσιμότητα τηλεμετρίας δεν προκαλεί σφάλμα σε κανένα από τα δύο behaviors, ωστόσο η διαδρομή των μετρήσεων δεν είναι κυριολεκτικά μηδενικού κόστους (zero-overhead). Μια προειδοποίηση καταγράφεται μία φορά κατά την εκκίνηση:

```
[Nest] WARN [TraceBehavior] OpenTelemetry SDK is NOT initialized — TraceBehavior will pass through without tracing.
[Nest] WARN [MetricsBehavior] OpenTelemetry metrics SDK is NOT initialized — MetricsBehavior will record to a no-op meter (metrics discarded).
```
