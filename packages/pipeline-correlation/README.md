# @nestjs-pipeline/correlation

Standalone correlation ID propagation for NestJS applications. Works with HTTP,
Bull/BullMQ, RabbitMQ, Kafka, NATS, gRPC, cron jobs, and any custom transport.

Part of the [@nestjs-pipeline](https://github.com/aristoteliss/nestjs-pipeline) monorepo.

## Installation

```bash
npm install @nestjs-pipeline/correlation
# or
pnpm add @nestjs-pipeline/correlation
```

> **Tip:** To bridge correlation IDs into the pipeline context, pass `getCorrelationId`
> as the `correlationIdFactory` option in `PipelineModule.forRoot()`.

## Features

- **`correlationStore`** — `AsyncLocalStorage` holding the current correlation ID
- **`getCorrelationId()`** — Read the active ID anywhere in the call stack
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
