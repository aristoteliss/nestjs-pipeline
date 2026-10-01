# @nestjs-pipeline/correlation

Standalone correlation ID propagation for NestJS applications. Works with HTTP,
Bull/BullMQ, RabbitMQ, Kafka, NATS, gRPC, cron jobs, and any custom transport.

Part of the [@nestjs-pipeline](https://github.com/aristoteliss/nestjs-pipeline) monorepo.

## Table of Contents

- [Installation](#installation)
- [Features](#features)
- [Quick Start](#quick-start)
- [HTTP](#http)
- [Queue consumers and other entry points](#queue-consumers-and-other-entry-points)
- [API Reference](#api-reference)
- [Migrating from 0.1.x](#migrating-from-01x)

## Installation

```bash
pnpm add @nestjs-pipeline/correlation @nestjs/common
```

Requires Node.js 22.12 or later and `@nestjs/common` `^12.1.0`.

Published as an ES module; a CommonJS application loads it with `require()`.

The package owns the correlation store and depends on no other pipeline package. To give
`@nestjs-pipeline/core` pipelines the ID set here, pass `correlationSource`:

```typescript
import { correlationSource } from '@nestjs-pipeline/correlation';

PipelineModule.forRoot({ sources: { correlationId: correlationSource } });
```

A pipeline then takes the ID as its `context.correlationId`, and `getCorrelationId()`
inside a handler returns that same ID.

## Features

- **`getCorrelationId()`** — Read the active ID, or a new UUIDv7 (generated on each call) when no context is active
- **`runWithCorrelationId(id, fn)`** — Execute a callback inside a correlation context
- **`addCorrelationId(data)`** — Stamp the current ID onto a payload (producer-side)
- **`correlationHeaders(key?)`** — Return a headers object for header-based transports
- **`@WithCorrelation()`** — Decorator for non-HTTP entry points (Bull, RabbitMQ, etc.)
- **`CorrelationFrom`** — Pre-built extractors for AMQP, Kafka, NATS, gRPC
- **`HttpCorrelationMiddleware`** — NestJS middleware for HTTP correlation, with validation of client-supplied IDs
- **`correlationSource`** — The store as a context source for `PipelineModule` and `JobContextModule`

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

> **⚠️ A plain object is required.** Arrays, dates, maps, sets, and class
> instances can lose structure when spread, so `addCorrelationId` rejects them.
> Wrap them first:
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
> logs a warning and keeps the current ID, or creates a new one when there is none. Use
> the `extract` option:
>
> ```ts
> @WithCorrelation({ extract: (items) => items?.[0]?.correlationId })
> async handle(items: any[]) { }
> ```


## HTTP

Register `HttpCorrelationMiddleware` explicitly; `PipelineModule` does not install it.
It reads the `x-correlation-id` header, accepts the value only when it is at most 128
characters and matches `DEFAULT_CORRELATION_ID_PATTERN`, and otherwise generates a UUIDv7.
It echoes the chosen ID in the response header of the same name and runs the rest of the
request inside it.

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

To change the header or the validation policy, provide `CORRELATION_OPTIONS` in the module
that applies the middleware:

```typescript
import {
  CORRELATION_OPTIONS,
  type CorrelationOptions,
  HttpCorrelationMiddleware,
} from '@nestjs-pipeline/correlation';

const correlationOptions: CorrelationOptions = {
  header: 'x-request-id',
  trimIncoming: true,
  maxLength: 36,
  validateIncoming: (id) => /^[0-9a-f-]{36}$/i.test(id),
};

@Module({
  providers: [{ provide: CORRELATION_OPTIONS, useValue: correlationOptions }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
  }
}
```

| Option | Default | Effect |
| --- | --- | --- |
| `header` | `'x-correlation-id'` | Header to read and echo. An invalid HTTP field name throws at construction; any non-string value, including `false`, selects the default. It does not disable the middleware. |
| `acceptIncoming` | `true` | `false` ignores client IDs and always generates one |
| `trimIncoming` | `false` | Trim whitespace before validation |
| `maxLength` | `128` | Longer IDs are replaced; must be a positive safe integer |
| `validateIncoming` | `DEFAULT_CORRELATION_ID_PATTERN` test | Replaces the pattern check; returning `false` or throwing rejects the ID. `maxLength` still applies. |

Outgoing HTTP calls forward the ID with `correlationHeaders()`:

```typescript
await fetch(url, { headers: { ...correlationHeaders(), 'content-type': 'application/json' } });
```

## Queue consumers and other entry points

`@WithCorrelation()` and `runWithCorrelationId(id, fn)` do the same thing: run the work
inside the given ID, or inside the current or a new one when the ID is missing. Neither
validates the ID; use `correlationSource.accepts(id)` for IDs from untrusted sources.

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { CommandBus } from '@nestjs/cqrs';
import { Job } from 'bullmq';
import { WithCorrelation, type WithCorrelationId } from '@nestjs-pipeline/correlation';

@Processor('emails')
export class EmailProcessor extends WorkerHost {
  constructor(private readonly commandBus: CommandBus) {
    super();
  }

  @WithCorrelation()
  async process(job: Job<WithCorrelationId<{ userId: string }>>) {
    await this.commandBus.execute(new SendEmailCommand(job.data.userId));
  }
}
```

Without a decorator, for example in a manual consumer loop:

```typescript
import { correlationSource, runWithCorrelationId } from '@nestjs-pipeline/correlation';

async function onMessage(message: { correlationId?: string; body: OrderPlaced }) {
  const incoming = message.correlationId;
  const id = incoming && correlationSource.accepts(incoming) ? incoming : undefined;
  await runWithCorrelationId(id, () => commandBus.execute(new ProjectOrder(message.body)));
}
```

Custom path or extractor, and cron work that gets a new ID per run:

```typescript
@WithCorrelation('data.meta.requestId')
async process(job: Job) {}

@EventPattern('order.placed')
@WithCorrelation({ extract: (_data, ctx) => (ctx as KafkaContext).getMessage().headers?.['x-correlation-id']?.toString() })
async onOrder(@Payload() data: unknown, @Ctx() ctx: KafkaContext) {}

@Cron('0 * * * *')
@WithCorrelation({ logLevel: 'none' })
async hourlySync() {}
```

For jobs that also carry a tenant and principal, use `withJobContext` and `@InJobContext`
of [`@nestjs-pipeline/job-context`](https://github.com/aristoteliss/nestjs-pipeline/tree/master/packages/pipeline-job-context#readme)
instead.

## API Reference

| Export | Type | Description |
|--------|------|-------------|
| `getCorrelationId()` | `() => string` | Read the current correlation ID, or generate a UUIDv7 when none exists |
| `runWithCorrelationId(id, fn)` | `(id: string \| undefined, fn: () => T) => T` | Execute a callback inside a populated correlation context |
| `addCorrelationId(data)` | `(data: T) => WithCorrelationId<T>` | Stamp the current ID onto a plain-object payload; throws `TypeError` otherwise |
| `WithCorrelationId<T>` | Type | `T & { correlationId: string }` |
| `correlationHeaders(key?)` | `(key?: string) => Record<string, string>` | Return a headers object for header-based transports |
| `@WithCorrelation(opts?)` | Decorator | Restore correlation context on non-HTTP entry points |
| `CorrelationDecoratorOptions`, `CorrelationExtractor` | Types | `{ path?, extract?, logLevel?, logger? }` and the extractor signature |
| `CorrelationFrom` | Object | Pre-built extractors: `.amqp()`, `.kafka()`, `.nats()`, `.grpc()` |
| `HttpCorrelationMiddleware` | NestJS Middleware | Extracts/generates correlation ID from HTTP `x-correlation-id` header; accepts an incoming ID of at most 128 characters matching `DEFAULT_CORRELATION_ID_PATTERN` unless `CORRELATION_OPTIONS` overrides `maxLength`/`validateIncoming` |
| `CORRELATION_OPTIONS`, `CorrelationOptions` | Token, type | Middleware configuration |
| `DEFAULT_CORRELATION_HEADER` | Constant | `'x-correlation-id'` |
| `DEFAULT_CORRELATION_ID_MAX_LENGTH`, `DEFAULT_CORRELATION_ID_PATTERN` | Constants | Default incoming-ID length limit (128) and character set |
| `correlationSource` | Object | `{ current, run, create, accepts }` over the correlation store, for `PipelineModule.forRoot({ sources })` and `JobContextModule.forRoot`; `current()` generates nothing, `create()` is the one place a new id is made, and `accepts(id)` applies the default length and character rule to an id received from outside |

### Pipeline integration

With `correlationSource` configured, a pipeline takes the current correlation ID when it starts and runs its behaviors
and handler inside it, so `getCorrelationId()` in a handler equals
`context.correlationId`, including in event handlers and nested commands it
dispatches. Outside any scope the pipeline takes a new ID from
`correlationSource.create()`. Without `correlationSource` in `sources`, a pipeline does
not run inside this store, so `getCorrelationId()` in its handler does not return
`context.correlationId`.

## Migrating from 0.1.x

These steps lead to 0.2.0. To reach 0.4.0, continue with [Upgrading from 0.2.x](https://github.com/aristoteliss/nestjs-pipeline#upgrading-from-02x) and
[Upgrading from 0.3.x](https://github.com/aristoteliss/nestjs-pipeline#upgrading-from-03x) in the repository README.

**Peer dependency.** `@nestjs/common` 10 is no longer supported; the peer range is
`^11.0.0`.

**`correlationIdFactory` and `correlationIdRunner` are replaced by `sources`.**

```typescript
// 0.1.x
PipelineModule.forRoot({
  correlationIdFactory: getCorrelationId,
  correlationIdRunner: runWithCorrelationId,
});

// 0.2.0
import { correlationSource } from '@nestjs-pipeline/correlation';

PipelineModule.forRoot({ sources: { correlationId: correlationSource } });
```

**`correlationStore` is removed.** Use the functions over the store.

```typescript
// 0.1.x
correlationStore.run(id, () => this.commandBus.execute(command));
const current = correlationStore.getStore(); // string | undefined

// 0.2.0
await runWithCorrelationId(id, () => this.commandBus.execute(command));
const current = correlationSource.current(); // string | undefined, generates nothing
```

**`setCorrelationFallback` is removed.** `getCorrelationId()` outside a context now always
generates a UUIDv7. Enter a context where work starts instead of registering a fallback.

```typescript
// 0.1.x
setCorrelationFallback(() => otelTraceId());

// 0.2.0
await runWithCorrelationId(otelTraceId(), () => work());
```

**`uuidv7` moved to `@cqrs-ddd/uuidv7`.**

```typescript
// 0.1.x
import { uuidv7 } from '@nestjs-pipeline/correlation';

// 0.2.0
import { uuidv7 } from '@cqrs-ddd/uuidv7';
```

**`context.correlationId` is read-only** and `originalCorrelationId` is removed from the
pipeline context of `@nestjs-pipeline/core`. Set the ID where work enters.

```typescript
// 0.1.x, in a behavior
context.correlationId = request.headers['x-request-id'];

// 0.2.0, at the entry point
{ provide: CORRELATION_OPTIONS, useValue: { header: 'x-request-id' } }
```

**Incoming HTTP IDs are validated.** `HttpCorrelationMiddleware` now replaces an ID longer
than 128 characters or outside `DEFAULT_CORRELATION_ID_PATTERN`, lowercases the configured
header, throws on an invalid header name, and sets the ID on the response. To keep
accepting any non-empty value:

```typescript
{ provide: CORRELATION_OPTIONS, useValue: { maxLength: 4096, validateIncoming: () => true } }
```

**`addCorrelationId` accepts plain objects only.** 0.1.x rejected arrays; 0.2.0 also
rejects class instances, `Date`, `Map` and other non-plain objects.

```typescript
// 0.1.x accepted, 0.2.0 throws TypeError
addCorrelationId(new OrderPlaced(orderId));

// 0.2.0
addCorrelationId({ ...orderPlaced });
```
