---
title: "@nestjs-pipeline/opentelemetry"
description: "Behaviors tracing & metrics μέσω OpenTelemetry για το @nestjs-pipeline/core"
editUrl: false
---

> **Από την έκδοση 0.5.0 το πακέτο αυτό συνεχίζει ως [`@cqrs-ddd/pipeline-opentelemetry`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-opentelemetry).** Ο κώδικας, τα issues και
> οι εκδόσεις του βρίσκονται στο [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-opentelemetry/).
> Οι εφαρμογές NestJS προσθέτουν το [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Οι εκδόσεις 0.1 έως 0.4 του
> `@nestjs-pipeline/opentelemetry` παραμένουν στο npm αμετάβλητες, και η γραμμή 0.4.x λαμβάνει μόνο διορθώσεις.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/opentelemetry.svg)](https://www.npmjs.com/package/@nestjs-pipeline/opentelemetry)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/opentelemetry.svg)](https://www.npmjs.com/package/@nestjs-pipeline/opentelemetry)

Behaviors **tracing & metrics** μέσω OpenTelemetry για το `@nestjs-pipeline/core` — αυτόματη δημιουργία spans **και** καταγραφή μετρικών διάρκειας/throughput/σφαλμάτων για κάθε κλήση pipeline command, query, και event, με πλούσια attributes και καταγραφή σφαλμάτων.

- **`TraceBehavior`** — περιτυλίγει κάθε handler σε ένα OTel span (μέσω του Trace API).
- **`MetricsBehavior`** — καταγράφει latency histogram και μετρητή κλήσεων (μέσω του Metrics API).

Και τα δύο είναι no-op-safe: εάν το αντίστοιχο SDK δεν έχει αρχικοποιηθεί, το OpenTelemetry API παρέχει no-op υλοποιήσεις τηλεμετρίας, επομένως οι handlers συνεχίζουν κανονικά και η τηλεμετρία απορρίπτεται σιωπηρά.

---

## Table of Contents

- [Εγκατάσταση](#installation)
- [Ρύθμιση](#setup)
  - [1. Αρχικοποίηση του OTel SDK](#1-initialize-the-otel-sdk)
  - [2. Δήλωση Providers Τηλεμετρίας](#2-register-telemetry-providers)
- [Λεπτομέρειες Span](#span-details)
- [Μετρικές](#metrics)
  - [Όργανα (Instruments)](#instruments)
  - [Attributes](#attributes)
  - [Δήλωση MetricsBehavior](#registering-metricsbehavior)
  - [Προσαρμοσμένο Όνομα Meter](#custom-meter-name)
  - [Παραδείγματα Ερωτημάτων](#example-queries)
- [Παραμετροποίηση](#configuration)
  - [Προσαρμοσμένος Logger](#custom-logger)
  - [Καθολικό Όνομα Tracer](#global-tracer-name)
  - [Όνομα Tracer ανά Handler](#per-handler-tracer-name)
  - [Όνομα Span και Προσαρμοσμένα Attributes](#span-name-and-custom-attributes)
  - [Απενεργοποίηση Τηλεμετρίας για έναν Handler](#disabling-telemetry-for-a-handler)
  - [Attributes Τοπικά στο Αίτημα](#request-local-attributes)
  - [Attributes από άλλα Behaviors](#attributes-from-other-behaviors)
  - [Attributes για Tenant και Correlation](#tenant-and-correlation-attributes)
- [Όρια αποτυχιών instrumentation](#instrumentation-failure-boundaries)
- [Δεν υπάρχει SDK; Κανένα πρόβλημα.](#no-sdk-no-problem)
- [Πλήρες Παράδειγμα](#full-example)
- [Μετάβαση από την έκδοση 0.1.x](#migrating-from-01x)
- [Αναφορά API](#api-reference)
- [Άδεια χρήσης](#license)

---

## Εγκατάσταση <a id="installation"></a>

```bash
pnpm add @cqrs-ddd/pipeline-opentelemetry @cqrs-ddd/nestjs @cqrs-ddd/pipeline @nestjs/cqrs @opentelemetry/api
```

**Peer dependencies:**

```bash
pnpm add @nestjs/common @nestjs/core reflect-metadata
```

Απαιτεί Node.js 22.12 ή νεότερο, `@nestjs/common` `^12.1.0` και `@opentelemetry/api` `^1.9.0`.

Θα χρειαστείτε επίσης ένα OTel SDK και exporter για το backend σας (π.χ. SigNoz, Jaeger, Datadog):

```bash
pnpm add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```

---

## Ρύθμιση <a id="setup"></a>

### 1. Αρχικοποίηση του OTel SDK <a id="1-initialize-the-otel-sdk"></a>

Το SDK **πρέπει** να ξεκινήσει πριν από το `NestFactory.create()` εάν θέλετε να εξάγεται τηλεμετρία. Η απλούστερη προσέγγιση είναι ένα ξεχωριστό αρχείο `tracing.ts` που εισάγεται ως η πρώτη γραμμή του `main.ts`:

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
import './tracing'; // ← ΠΡΕΠΕΙ να είναι το πρώτο import
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

### 2. Δήλωση Providers Τηλεμετρίας <a id="2-register-telemetry-providers"></a>

Στο module εφαρμογής ή observability, δηλώστε τα `TraceBehavior`, `MetricsBehavior`, και `AttributesBehavior` ως providers και τοποθετήστε τα στο καθολικό pipeline:

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

Αυτό ήταν — κάθε command, query, και event handler εκπέμπει πλέον OTel spans αυτόματα όταν είναι εγκατεστημένος ένας tracer provider· διαφορετικά το Trace API χρησιμοποιεί τον no-op tracer του.

---

## Λεπτομέρειες Span <a id="span-details"></a>

Κάθε span περιλαμβάνει τα ακόλουθα:

| Πεδίο | Παράδειγμα Τιμής |
|---|---|
| **Span name** | `command.CreateUserCommand` |
| **Span kind** | `INTERNAL` |
| `pipeline.request.kind` | `command` |
| `pipeline.request.name` | `CreateUserCommand` |
| `pipeline.handler.name` | `CreateUserHandler` |
| `pipeline.correlation_id` | `019728a3-7f4a-7b3e-8a1d-...` |
| `pipeline.started_at` | `2026-03-01T12:00:00.000Z` |
| `pipeline.tenant_id` | `acme` _(μόνο όταν το pipeline διαθέτει tenant)_ |
| `pipeline.outcome` | `success` \| `failure` _(ορίζεται κατά την ολοκλήρωση του handler)_ |
| `error.type` | `ZodValidationError` _(μόνο σε αποτυχίες· `err.name`, ή `unknown` για μη-`Error` τιμές)_ |

Attributes που προστίθενται μέσω του `addPipelineTelemetryAttributes()` και επιστρέφονται από το
`attributeFactory` εφαρμόζονται επίσης (δείτε την [Παραμετροποίηση](#configuration)).

**Σε επιτυχία:**

- Κατάσταση Span: `OK`

**Σε σφάλμα:**

- Κατάσταση Span: `ERROR` με το μήνυμα της εξαίρεσης
- Η εξαίρεση καταγράφεται στο span μέσω `span.recordException(err)` (απενεργοποίηση με `recordException: false`)
- Το αρχικό σφάλμα επανεκπέμπεται αμετάβλητο

---

## Μετρικές <a id="metrics"></a>

Το `MetricsBehavior` καταγράφει OpenTelemetry **μετρικές** μέσω του Metrics API,
συμπληρώνοντας τα spans που εκπέμπει το `TraceBehavior`. Από αυτά τα δύο instruments
μπορείτε να εξάγετε **throughput**, **error-rate**, και **ποσοστημόρια καθυστέρησης (latency percentiles)**
(p50/p95/p99) ανά handler.

### Όργανα (Instruments) <a id="instruments"></a>

| Instrument | Τύπος | Μονάδα | Περιγραφή |
|---|---|---|---|
| `pipeline.handler.duration` | Histogram | `ms` | Χρόνος εκτέλεσης του handler |
| `pipeline.handler.invocations` | Counter | — | Αριθμός ολοκληρωμένων κλήσεων handler |
| `pipeline.handler.active` | UpDownCounter | — | Handlers που εκτελούνται αυτή τη στιγμή |

### Attributes <a id="attributes"></a>

Το `pipeline.handler.active` φέρει μόνο το είδος αιτήματος, το όνομα αιτήματος και
το όνομα handler. Τα instruments διάρκειας και κλήσεων επισημαίνονται με τα ίδια **χαμηλής πληθικότητας (low-cardinality)** attributes ώστε να
μπορούν να ομαδοποιηθούν ανά handler και αποτέλεσμα:

| Attribute | Παράδειγμα Τιμής |
|---|---|
| `pipeline.request.kind` | `command` |
| `pipeline.request.name` | `CreateUserCommand` |
| `pipeline.handler.name` | `CreateUserHandler` |
| `outcome` | `success` \| `failure` |
| `pipeline.outcome` | `success` \| `failure` _(ίδια τιμή, με namespace)_ |
| `error.type` | `ZodValidationError` _(μόνο σε αποτυχίες — `err.name`)_ |

> **Γιατί όχι `correlation_id` / `started_at`;** Σε αντίθεση με τα spans, τα attributes των μετρικών
> γίνονται διαστάσεις χρονοσειρών (time-series). Τιμές υψηλής πληθικότητας (high-cardinality, όπως correlation ids,
> timestamps) θα εκτόξευαν τον αριθμό των σειρών σας — ανήκουν στα spans, όχι
> στις μετρικές. Το `error.type` χρησιμοποιεί το `err.name`, το οποίο είναι πεπερασμένο.

### Δήλωση MetricsBehavior <a id="registering-metricsbehavior"></a>

Δηλώστε το δίπλα στο `TraceBehavior` (συνήθως στην ομάδα `after`):

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

Θα χρειαστείτε επίσης έναν exporter **μετρικών** συνδεδεμένο στο SDK σας (επιπλέον του
exporter για traces), π.χ.:

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

### Προσαρμοσμένο Όνομα Meter <a id="custom-meter-name"></a>

Όπως και το `tracerName`, το `meterName` μπορεί να οριστεί καθολικά ή να παρακαμφθεί
ανά handler μέσω του `@UsePipeline`:

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
    // Οι μετρικές αυτού του handler καταγράφονται στο meter 'payment-service'
    return this.paymentGateway.charge(command);
  }
}
```

Εάν δεν δοθεί `meterName` (ούτε καθολικά ούτε ανά handler), η προεπιλογή είναι
το `'nestjs-pipeline'`.

### Παραδείγματα Ερωτημάτων <a id="example-queries"></a>

Με ένα pipeline OTLP → Prometheus, τα instruments αντιστοιχίζονται σε χρονοσειρές που μπορείτε
να αναζητήσετε απευθείας:

```text
# Ρυθμός αιτημάτων ανά handler (req/s)
sum by (pipeline_handler_name) (rate(pipeline_handler_invocations_total[1m]))

# Ρυθμός σφαλμάτων ανά handler
sum by (pipeline_handler_name) (
  rate(pipeline_handler_invocations_total{outcome="failure"}[5m])
)

# p95 latency ανά handler
histogram_quantile(
  0.95,
  sum by (le, pipeline_handler_name) (
    rate(pipeline_handler_duration_bucket[5m])
  )
)
```

> Τα ακριβή ονόματα μετρικών/labels εξαρτώνται από τις συμβάσεις ονοματοδοσίας του exporter σας (ο
> Prometheus exporter, για παράδειγμα, μετατρέπει τις τελείες σε underscores και προσθέτει
> `_total` στους μετρητές).

---

## Παραμετροποίηση <a id="configuration"></a>

### Custom Logger <a id="custom-logger"></a>

Το `MetricsBehavior` κάνει προαιρετικά inject ένα Nest `LoggerService` μέσω του token `LOGGING_BEHAVIOR_LOGGER` και το χρησιμοποιεί αποκλειστικά για αναφορά αποτυχιών instrumentation (ένα `warn` όταν δεν μπορούν να δημιουργηθούν instruments, ένα `debug` όταν αποτύχει μια καταγραφή). Δεν καταγράφει τίποτα κατά την εκκίνηση. Το `TraceBehavior` δεν κάνει inject κανέναν logger.

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

Χωρίς συνδεδεμένο logger, οι αποτυχίες instrumentation αποκρύπτονται σιωπηρά.

### Global Tracer Name <a id="global-tracer-name"></a>

Ορίστε το όνομα του tracer κατά την καθολική δήλωση — αυτό εμφανίζεται στο εργαλείο APM σας:

```typescript
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    after: [[TraceBehavior, { tracerName: 'my-service' }]],
  },
})
```

### Per-Handler Tracer Name <a id="per-handler-tracer-name"></a>

Παρακάμψτε το όνομα tracer για συγκεκριμένους handlers χρησιμοποιώντας το `@UsePipeline`:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { trace } from '@nestjs-pipeline/opentelemetry';

@CommandHandler(ProcessPaymentCommand)
@UsePipeline(trace({ tracerName: 'payment-service' }))
export class ProcessPaymentHandler implements ICommandHandler<ProcessPaymentCommand> {
  async execute(command: ProcessPaymentCommand): Promise<PaymentResult> {
    // Τα spans αυτού του handler θα εμφανίζονται κάτω από τον tracer 'payment-service'
    return this.paymentGateway.charge(command);
  }
}
```

Εάν δεν οριστεί `tracerName` (ούτε καθολικά ούτε ανά handler), η προεπιλογή είναι `'nestjs-pipeline'`.

### Όνομα Span και Προσαρμοσμένα Attributes <a id="span-name-and-custom-attributes"></a>

Το `spanName` δέχεται string ή συνάρτηση του pipeline context. Ένα κενό
αποτέλεσμα, ή μια συνάρτηση που πετάει σφάλμα, επανέρχεται στο `{requestKind}.{requestName}`.
Το `attributeFactory` μπορεί να είναι σύγχρονο ή ασύγχρονο· εάν πετάξει σφάλμα, διατηρούνται
τα προεπιλεγμένα attributes.

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
    // Τα labels μετρικών πρέπει να παραμένουν bounded: όχι ids, emails ή raw τιμές αιτημάτων.
    attributeFactory: () => ({ 'app.operation': 'invoice.read' }),
  }),
)
export class GetInvoiceHandler implements IQueryHandler<GetInvoiceQuery> {
  async execute(query: GetInvoiceQuery): Promise<Invoice> {
    return this.invoices.get(query.invoiceId);
  }
}
```

### Απενεργοποίηση Τηλεμετρίας για έναν Handler <a id="disabling-telemetry-for-a-handler"></a>

Όταν τα behaviors δηλώνονται καθολικά, το `enabled: false` τα παρακάμπτει για έναν
πολύ συχνό ή θορυβώδη handler χωρίς να αφαιρείται η καθολική δήλωση:

```typescript
@QueryHandler(HealthCheckQuery)
@UsePipeline(trace({ enabled: false }), metrics({ enabled: false }))
export class HealthCheckHandler implements IQueryHandler<HealthCheckQuery> {
  async execute(): Promise<string> {
    return 'ok';
  }
}
```

### Attributes Τοπικά στο Αίτημα <a id="request-local-attributes"></a>

Ένα μεταγενέστερο behavior ή ο ίδιος ο handler μπορεί να εμπλουτίσει το span του αιτήματος χωρίς
να δημιουργήσει child span. Το `TraceBehavior` διαβάζει τη συλλογή πριν και ξανά μετά
την εκτέλεση, οπότε attributes που προστέθηκαν αργότερα φτάνουν κανονικά στο span. Ορίστε
`includeContextAttributes: false` στο `trace()` για να αγνοήσετε τη συλλογή.

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

Το `getPipelineTelemetryAttributes(context)` επιστρέφει ένα αντίγραφο της συλλογής. Η συλλογή
**δεν** αντιγράφεται στα labels μετρικών εκτός εάν έχει οριστεί
`metrics({ includeContextAttributes: true })`· ενεργοποιήστε το μόνο όταν κάθε τιμή στη συλλογή είναι περιορισμένη (bounded).

### Attributes από άλλα Behaviors <a id="attributes-from-other-behaviors"></a>

Behaviors που δεν εξαρτώνται άμεσα από τηλεμετρία δημοσιεύουν τις αποφάσεις τους ως
εγγραφές στο `context.items`, και τα πακέτα τους εξάγουν ένα factory που μετατρέπει αυτές τις
εγγραφές σε attributes. Το `AttributesBehavior` εκτελεί τα factories μόλις ολοκληρωθεί η υπόλοιπη
αλυσίδα, επιτυχώς ή μη, και προσθέτει το αποτέλεσμα στη συλλογή, ώστε το
`TraceBehavior` να το τοποθετήσει στο span και το `MetricsBehavior` στα labels του όταν το
`includeContextAttributes` είναι ενεργό. Δηλώστε το εσωτερικά των `TraceBehavior` και
`MetricsBehavior` και εξωτερικά των behaviors που περιγράφει:

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

| Factory | Πακέτο | Attributes |
| --- | --- | --- |
| `buildFeatureFlagAttributes` | `@nestjs-pipeline/feature-flags` | `feature_flag.key`, `feature_flag.enabled`· `feature_flag.variant`, `feature_flag.reason` και `feature_flag.error_code` όταν αναφέρονται |
| `buildCacheAttributes` | `@nestjs-pipeline/cache` | `cache.hit` |
| `buildIdempotencyAttributes` | `@nestjs-pipeline/idempotency` | `idempotency.replayed`· `idempotency.ownership_lost` όταν χάθηκε η δέσμευση |
| `buildRateLimitAttributes` | `@nestjs-pipeline/rate-limit` | `rate_limit.remaining_points` |
| `buildDeadLetterAttributes` | `@nestjs-pipeline/deadletter` | `dead_letter.captured` όταν παραδόθηκε μια εγγραφή |

Ένα factory δεν επιστρέφει τίποτα για ένα behavior που δεν εκτελέστηκε, οπότε ένα αίτημα χωρίς
caching δεν φέρει `cache.hit` αντί για εσφαλμένο miss, και κανένα factory δεν περιλαμβάνει κλειδί
cache, idempotency ή rate-limit, καθώς αυτά περιέχουν tenants και principals.
Τα factories εκτελούνται με τη σειρά και ένα μεταγενέστερο υπερισχύει σε κοινό όνομα· εάν κάποιο πετάξει
εξαίρεση ή απορριφθεί, δεν προσθέτει τίποτα, τα υπόλοιπα εξακολουθούν να ισχύουν, και το αποτέλεσμα ή το
σφάλμα του αιτήματος επιστρέφεται αμετάβλητο.

Επιλέξτε τα factories που θέλετε, και περιτυλίξτε κάποιο για να μετονομάσετε ή να αφαιρέσετε attributes:

```typescript
const cacheHit: PipelineTelemetryAttributeFactory = (context) => {
  const { 'cache.hit': hit } = buildCacheAttributes(context);
  return hit === undefined ? {} : { 'app.cache_hit': hit };
};
```

Το `rate_limit.remaining_points` λαμβάνει τόσες τιμές όσους πόντους διαθέτει ο limiter· κρατήστε το
έξω από labels μετρικών εκτός εάν αυτή η πληθικότητα είναι αποδεκτή.

### Attributes για Tenant και Correlation <a id="tenant-and-correlation-attributes"></a>

Τα `pipeline.correlation_id` και `pipeline.tenant_id` προέρχονται από το pipeline
context. Ρυθμίστε από πού τα αντλεί το pipeline με την επιλογή `sources` στο
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

Και οι δύο τιμές αποτελούν αποκλειστικά attributes span. Δεν αποτελούν ποτέ labels μετρικών από προεπιλογή,
επειδή είναι απεριόριστης πληθικότητας (unbounded).

---

## Όρια αποτυχιών instrumentation <a id="instrumentation-failure-boundaries"></a>

Ο εμπλουτισμός span, το status, η καταγραφή εξαιρέσεων, η ολοκλήρωση span, η καταγραφή μετρικών,
και τα διαγνωστικά logs γίνονται με προσπάθεια βέλτιστης απόδοσης (best-effort). Αποτυχίες σε αυτές τις προστατευμένες
λειτουργίες δεν αντικαθιστούν το αποτέλεσμα του handler ή το αρχικό του σφάλμα. Αυτό περιγράφει τα όρια κλήσεων του
πακέτου· δεν εγγυάται παράδοση στον exporter ούτε προστατεύει από αυθαίρετες ασύγχρονες αποτυχίες
μέσα σε ένα SDK.

## Δεν υπάρχει SDK; Κανένα πρόβλημα. <a id="no-sdk-no-problem"></a>

Εάν το OpenTelemetry SDK **δεν** έχει αρχικοποιηθεί (για παράδειγμα κατά την ανάπτυξη ή σε δοκιμές), και τα δύο behaviors παραμένουν ασφαλή επειδή το OpenTelemetry API παρέχει no-op υλοποιήσεις.

- Το `TraceBehavior` καλεί πάντα το δημόσιο Trace API. Χωρίς δηλωμένο tracer provider, το `trace.getTracer()` επιστρέφει τον no-op tracer του API· οι λειτουργίες span απορρίπτονται και ο περιτυλιγμένος handler εξακολουθεί να εκτελείται κανονικά.
- Το `MetricsBehavior` εκτελεί τις κανονικές του κλήσεις χρονισμού και καταγραφής μετρικών έναντι ενός no-op meter, οπότε οι καταγραφές απορρίπτονται σιωπηρά.

Κανένα από τα δύο behaviors δεν καταγράφει μήνυμα κατά την εκκίνηση σχετικά με την ετοιμότητα του SDK.

Το `TraceBehavior` σκοπίμως **δεν** επιθεωρεί λεπτομέρειες υλοποίησης του provider όπως `ProxyTracerProvider.getDelegate()`, `getDelegateTracer()`, ή `constructor.name`. Αυτές αποτελούν λεπτομέρειες υλοποίησης και όχι το δημόσιο συμβόλαιο ετοιμότητας, και ενδέχεται να αλλάξουν μεταξύ εκδόσεων του OpenTelemetry.

Εάν θέλετε να παραλείψετε ακόμα και τις no-op κλήσεις API για έναν συγκεκριμένο handler, ορίστε `enabled: false` στο `TraceBehaviorOptions` ή `MetricsBehaviorOptions`.

---

## Πλήρες Παράδειγμα <a id="full-example"></a>

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
    // Αυτός ο handler πλέον:
    // 1. Καταγράφεται (καθολικό LoggingBehavior + παράκαμψη handler)
    // 2. Παρακολουθείται (καθολικό TraceBehavior → span: command.CreateUserCommand)
    // 3. Μετριέται     (καθολικό MetricsBehavior → duration histogram + μετρητής κλήσεων)
    // 4. Επικυρώνεται  (καθολικό ZodValidationBehavior → εφαρμόζει επιτυχή έξοδο schema στο αίτημα)
    return this.userRepository.create(command.username, command.email);
  }
}
```

**Αποτέλεσμα στο εργαλείο APM σας (π.χ. SigNoz, Jaeger):**

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

**Επιπλέον μετρικές** (για τον ίδιο handler) στο meter `my-service`:

```
pipeline.handler.duration{...,outcome="success"}     histogram → p50/p95/p99 latency
pipeline.handler.invocations{...,outcome="success"} counter   → request & error rate
```

---

## Μετάβαση από την έκδοση 0.1.x <a id="migrating-from-01x"></a>

Αυτά τα βήματα οδηγούν στην έκδοση 0.2.0. Για να φτάσετε στην 0.4.0, συνεχίστε με την [Αναβάθμιση από 0.2.x](/nestjs-pipeline/upgrading/from-0-2/) και
την [Αναβάθμιση από 0.3.x](/nestjs-pipeline/upgrading/from-0-3/) στο README του repository.

Η έκδοση 0.1.x εξήγαγε μόνο τα `TraceBehavior` και `TraceBehaviorOptions`. Όλα τα υπόλοιπα
που αναφέρονται στην [Αναφορά API](#api-reference) είναι νέα στην 0.2.0.

### Peer dependencies και runtime <a id="peer-dependencies-and-runtime"></a>

| | 0.1.x | 0.2.0 |
|---|---|---|
| `@nestjs/common` | `^10.0.0 \|\| ^11.0.0` | `^11.0.0` |
| `@nestjs-pipeline/core` | `*` | `^0.2.0` |
| Node.js | δεν δηλωνόταν | `>=22.0.0` |

```bash
pnpm add @nestjs-pipeline/opentelemetry@^0.2.0 @nestjs-pipeline/core@^0.2.0 @nestjs/common@^11
```

### Το `TraceBehaviorOptions` είναι type-only export <a id="tracebehavioroptions-is-a-type-only-export"></a>

Στην 0.1.x εξαγόταν χωρίς τον τροποποιητή `type`. Πλέον εξάγεται ως
τύπος, οπότε εισάγετέ το με `import type` υπό το `isolatedModules` ή
`verbatimModuleSyntax`:

```typescript
// 0.1.x
import { TraceBehavior, TraceBehaviorOptions } from '@nestjs-pipeline/opentelemetry';

// 0.2.0
import { TraceBehavior, type TraceBehaviorOptions } from '@nestjs-pipeline/opentelemetry';
```

### Το `TraceBehavior` δεν ελέγχει πλέον την ετοιμότητα του SDK ούτε καταγράφει logs <a id="tracebehavior-no-longer-checks-sdk-readiness-or-logs"></a>

Στην 0.1.x, το `TraceBehavior` υλοποιούσε το `OnModuleInit`, έκανε inject το
`LOGGING_BEHAVIOR_LOGGER`, κατέγραφε ένα μήνυμα εκκίνησης `warn`/`log` σχετικά με την ετοιμότητα του SDK και
παρέλειπε τη δημιουργία span όταν δεν εντόπιζε SDK delegate. Στην 0.2.0 δεν έχει
εξαρτήσεις στον constructor, ούτε `onModuleInit()`, και καλεί πάντα το δημόσιο Trace
API (ένας no-op tracer απορρίπτει τα spans όταν δεν έχει δηλωθεί SDK).

```typescript
// 0.1.x: συνδεόταν μόνο ώστε το μήνυμα εκκίνησης του TraceBehavior να χρησιμοποιεί το pino
@Module({
  providers: [
    TraceBehavior,
    { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: NativeLogger },
  ],
})
export class AppModule {}

// 0.2.0: Το TraceBehavior αγνοεί το token· διατηρήστε τη σύνδεση μόνο εάν
// τη χρησιμοποιεί το LoggingBehavior ή το MetricsBehavior
@Module({
  providers: [TraceBehavior],
})
export class AppModule {}
```

Κώδικας ή δοκιμές που καλούσαν `traceBehavior.onModuleInit()`, ή έλεγχαν την παρουσία
του warning "OpenTelemetry SDK is NOT initialized", πρέπει να αφαιρέσουν αυτές τις κλήσεις. Για να παραλείψετε
το tracing για έναν handler, χρησιμοποιήστε `enabled: false` αντί να βασίζεστε στον εντοπισμό του SDK:

```typescript
// 0.2.0
@UsePipeline(trace({ enabled: false }))
export class HealthCheckHandler {}
```

### Span attributes και διαχείριση αποτυχιών <a id="span-attributes-and-failure-handling"></a>

Τα spans διατηρούν το όνομα και τα attributes της 0.1.x, και προσθέτουν τα `pipeline.tenant_id` (όταν
υπάρχει), `pipeline.outcome` και `error.type`. Dashboards ή span processors
που ελέγχουν ακριβές σύνολο attributes θα πρέπει να τα λάβουν υπόψη. Ένας tracer ή
callback εμπλουτισμού που πετάει σφάλμα δεν προκαλεί πλέον αποτυχία του αιτήματος: ο handler εκτελείται
μία φορά, χωρίς tracing αν χρειαστεί, και επιστρέφεται το δικό του αποτέλεσμα ή σφάλμα.

### Υιοθέτηση των tuple helpers <a id="adopting-the-tuple-helpers"></a>

Η δήλωση μέσω tuple εξακολουθεί να λειτουργεί. Το helper `trace()` αποτελεί μια ισοδύναμη μορφή
με αυστηρό έλεγχο τύπων:

```typescript
// 0.1.x
@UsePipeline([TraceBehavior, { tracerName: 'payment-service' }])

// 0.2.0 (οποιαδήποτε μορφή)
@UsePipeline([TraceBehavior, { tracerName: 'payment-service' }])
@UsePipeline(trace({ tracerName: 'payment-service' }))
```

---

## Αναφορά API <a id="api-reference"></a>

| Export | Τύπος | Περιγραφή |
|---|---|---|
| `TraceBehavior` | Κλάση | Pipeline behavior — δημιουργεί OTel spans ανά κλήση handler· χρησιμοποιεί τον no-op tracer του API όταν δεν έχει δηλωθεί SDK |
| `TraceBehaviorOptions` | Interface | `tracerName`, `enabled`, `spanName`, `attributeFactory`, `recordException`, `includeContextAttributes` (προεπιλογή `true`) |
| `trace` | Συνάρτηση | Typed intent builder που επιστρέφει `[TraceBehavior, options]` για το `@UsePipeline` |
| `TraceIntentOptions` | Τύπος | Alias για το `TraceBehaviorOptions` |
| `MetricsBehavior` | Κλάση | Pipeline behavior — καταγράφει duration histogram, μετρητή κλήσεων και in-flight μετρητή ανά handler |
| `MetricsBehaviorOptions` | Interface | `meterName`, `enabled`, `attributeFactory`, `includeContextAttributes` (προεπιλογή `false`) |
| `metrics` | Συνάρτηση | Typed intent builder που επιστρέφει `[MetricsBehavior, options]` για το `@UsePipeline` |
| `MetricsIntentOptions` | Τύπος | Alias για το `MetricsBehaviorOptions` |
| `AttributesBehavior` | Κλάση | Pipeline behavior — προσθέτει τα attributes των δηλωμένων factories στη συλλογή μετά την εκτέλεση της αλυσίδας |
| `AttributesBehaviorOptions` | Interface | `factories` — factories attributes, εφαρμοσμένα με τη σειρά |
| `addPipelineTelemetryAttributes` | Συνάρτηση | Συγχωνεύει attributes στη συλλογή τηλεμετρίας τοπικά στο αίτημα |
| `getPipelineTelemetryAttributes` | Συνάρτηση | Επιστρέφει αντίγραφο της συλλογής τηλεμετρίας τοπικά στο αίτημα |
| `buildTraceAttributes` | Συνάρτηση | Προεπιλεγμένα attributes span για ένα pipeline context |
| `buildMetricAttributes` | Συνάρτηση | Προεπιλεγμένα attributes μετρικών χαμηλής πληθικότητας (kind, request name, handler name) |
| `PIPELINE_OTEL_ATTRIBUTES` | Σταθερά | Ονόματα attributes που εκπέμπονται από αυτό το πακέτο |
| `PIPELINE_TELEMETRY_ATTRIBUTES` | Symbol | Το `Symbol.for` key της τοπικής συλλογής στο `context.items` |
| `PipelineTelemetryAttributeFactory` | Τύπος | `(context) => Attributes \| Promise<Attributes>` |

---

## Άδεια χρήσης <a id="license"></a>

Διπλή άδεια χρήσης υπό την **AGPLv3** και **Εμπορική Άδεια (Commercial License)**. Δείτε τα [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) στη ρίζα για λεπτομέρειες.
