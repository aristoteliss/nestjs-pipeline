# @nestjs-pipeline/correlation

Standalone correlation ID propagation for NestJS applications. Works with HTTP,
Bull/BullMQ, RabbitMQ, Kafka, NATS, gRPC, cron jobs, and any custom transport.

Part of the [@nestjs-pipeline](https://github.com/aristoteliss/nestjs-pipeline) monorepo.

## Table of Contents

- [Installation](#installation)
- [Features](#features)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)

## Installation

```bash
npm install @nestjs-pipeline/correlation
# or
pnpm add @nestjs-pipeline/correlation
```

> **Tip:** To integrate correlation IDs with the pipeline context, pass
> `getCorrelationId` as `correlationIdFactory` and `runWithCorrelationId` as
> `correlationIdRunner` in `PipelineModule.forRoot()`.

## Features

- **`correlationStore`** — `AsyncLocalStorage` holding the current correlation ID
- **`getCorrelationId()`** — Read the active ID, falling back to a UUIDv7 when no context is active
- **`runWithCorrelationId(id, fn)`** — Execute a callback inside a correlation context
- **`addCorrelationId(data)`** — Stamp the current ID onto a payload (producer-side)
- **`correlationHeaders(key?)`** — Return a headers object for header-based transports
- **`@WithCorrelation()`** — Decorator for non-HTTP entry points (Bull, RabbitMQ, etc.)
- **`CorrelationFrom`** — Pre-built extractors for AMQP, Kafka, NATS, gRPC
- **`HttpCorrelationMiddleware`** — NestJS middleware for HTTP correlation
- **`uuidv7()`** — Timestamp-sortable UUID per RFC 9562

## Quick Start

### Producer side — stamping a correlation ID

Use `addCorrelationId(data)` to attach the current correlation ID to any
plain-object payload before publishing or enqueuing:

```ts
import { addCorrelationId } from '@nestjs-pipeline/correlation';

// Bull / BullMQ
await queue.add('send-email', addCorrelationId({ userId, email }));

// RabbitMQ (ClientProxy)
this.client.emit('user.created', addCorrelationId(payload));
```

> **⚠️ Arrays are not allowed.** `addCorrelationId` spreads `data` into a new
> object. Passing an array destroys its structure (`[a, b]` → `{ '0': a, '1': b }`).
> Wrap it first:
>
> ```ts
> // ❌ Throws TypeError
> addCorrelationId([item1, item2]);
>
> // ✅ Correct
> addCorrelationId({ items: [item1, item2] });
> ```

For header-based transports (Kafka, NATS, gRPC), use `correlationHeaders()` instead:

```ts
import { correlationHeaders } from '@nestjs-pipeline/correlation';

await producer.send({
  topic: 'orders',
  messages: [{ value: JSON.stringify(order), headers: correlationHeaders() }],
});
```

### Consumer side — extracting the correlation ID

Use `@WithCorrelation()` on any non-HTTP handler to restore the correlation
context:

```ts
import { WithCorrelation, getCorrelationId } from '@nestjs-pipeline/correlation';

// Bull (default path: data.correlationId, logs at debug level)
@Process('send-email')
@WithCorrelation()
async handleSendEmail(job: Job) {
  const id = getCorrelationId(); // same ID the producer stamped
}

// Suppress the startup log
@Process('send-sms')
@WithCorrelation({ logLevel: 'none' })
async handleSendSms(job: Job) { }
```

For transports with native headers, use the `CorrelationFrom` presets:

```ts
import { CorrelationFrom } from '@nestjs-pipeline/correlation';

// RabbitMQ
@MessagePattern('user.created')
@WithCorrelation(CorrelationFrom.amqp())
async handle(@Payload() data: any, @Ctx() ctx: RmqContext) { }

// Kafka
@EventPattern('order.placed')
@WithCorrelation(CorrelationFrom.kafka())
async handle(@Payload() data: any, @Ctx() ctx: KafkaContext) { }
```

> **⚠️ Array payloads:** The default dot-path extraction expects the first
> argument to be an object. If your handler receives an array, the decorator
> logs a warning and falls back to `uuidv7()`. Use the `extract` option:
>
> ```ts
> @WithCorrelation({ extract: (items) => items?.[0]?.correlationId })
> async handle(items: any[]) { }
> ```


## API Reference

| Export | Type | Description |
|--------|------|-------------|
| `correlationStore` | `AsyncLocalStorage<string>` | Holds the current correlation ID |
| `getCorrelationId()` | `() => string` | Read the active/fallback ID, or generate a UUIDv7 when none exists |
| `runWithCorrelationId(id, fn)` | `(id: string \| undefined, fn: () => T) => T` | Execute a callback inside a populated correlation context |
| `addCorrelationId(data)` | `(data: object) => object` | Stamp the current ID onto a plain-object payload |
| `correlationHeaders(key?)` | `(key?: string) => Record<string, string>` | Return a headers object for header-based transports |
| `@WithCorrelation(opts?)` | Decorator | Restore correlation context on non-HTTP entry points |
| `CorrelationFrom` | Object | Pre-built extractors: `.amqp()`, `.kafka()`, `.nats()`, `.grpc()` |
| `HttpCorrelationMiddleware` | NestJS Middleware | Extracts/generates correlation ID from HTTP `x-correlation-id` header |
| `uuidv7()` | `() => string` | Generate a timestamp-sortable UUID v7 (RFC 9562) |

### Pipeline integration

The core module exposes two independent hooks. `correlationIdFactory` chooses the
ID assigned to a new pipeline context; `correlationIdRunner` wraps execution in
an external correlation context. Configure both to keep the pipeline context and
this package's `AsyncLocalStorage` aligned:

```typescript
import { PipelineModule } from '@nestjs-pipeline/core';
import {
  getCorrelationId,
  runWithCorrelationId,
} from '@nestjs-pipeline/correlation';

PipelineModule.forRoot({
  correlationIdFactory: getCorrelationId,
  correlationIdRunner: runWithCorrelationId,
})
```

For HTTP requests, register `HttpCorrelationMiddleware` explicitly in your app
module. The middleware is not installed automatically by either package:

```typescript
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HttpCorrelationMiddleware } from '@nestjs-pipeline/correlation';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
  }
}
```
