# @nestjs-pipeline/opentelemetry

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/opentelemetry.svg)](https://www.npmjs.com/package/@nestjs-pipeline/opentelemetry)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/opentelemetry.svg)](https://www.npmjs.com/package/@nestjs-pipeline/opentelemetry)

OpenTelemetry tracing behavior for `@nestjs-pipeline/core` — auto-creates spans for every command, query, and event pipeline invocation with rich attributes and error recording.

---

## Table of Contents

- [Installation](#installation)
- [Setup](#setup)
  - [1. Initialize the OTel SDK](#1-initialize-the-otel-sdk)
  - [2. Register TraceBehavior](#2-register-tracebehavior)
- [Span Details](#span-details)
- [Configuration](#configuration)
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

## Configuration

### Custom Logger

`TraceBehavior` accepts a custom Nest `LoggerService` via the `TRACE_BEHAVIOR_LOGGER` token.
This is useful when your app uses `nestjs-pino`.

```typescript
import { Module } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import {
  TRACE_BEHAVIOR_LOGGER,
  TraceBehavior,
} from '@nestjs-pipeline/opentelemetry';

@Module({
  providers: [
    TraceBehavior,
    { provide: TRACE_BEHAVIOR_LOGGER, useExisting: Logger },
  ],
})
export class AppModule {}
```

The same Nest-to-pino level mapping applies here (`verbose` → `trace`, `log` → `info`, etc.).

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

If the OpenTelemetry SDK is **not** initialized (e.g. in development or test environments), `TraceBehavior` detects this at module init and silently passes through — no overhead, no errors, no thrown exceptions.

A warning is logged once at startup:

```
[Nest] WARN [TraceBehavior] OpenTelemetry SDK is NOT initialized — TraceBehavior will pass through without tracing. Ensure your tracing bootstrap runs BEFORE NestFactory.create() (import "./tracing" as the first line of main.ts, or use --require ./tracing.js).
```

When the SDK IS active:

```
[Nest] LOG [TraceBehavior] OpenTelemetry tracer provider is active — spans will be emitted.
```

---

## Full Example

```typescript
// ── tracing.ts ──
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
  serviceName: 'users-api',
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
import { TraceBehavior } from '@nestjs-pipeline/opentelemetry';
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
    // 1. Logged (global LoggingBehavior + handler override)
    // 2. Traced (global TraceBehavior → span: command.CreateUserCommand)
    // 3. Validated (global ZodValidationBehavior → checks _zodSchema)
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

---

## API Reference

| Export | Type | Description |
|---|---|---|
| `TraceBehavior` | Class | Pipeline behavior — creates OTel spans per handler invocation |
| `TraceBehaviorOptions` | Interface | `{ tracerName?: string }` — configure the tracer name |

---

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](../../LICENSE) and [`COMMERCIAL_LICENSE.txt`](../../COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
