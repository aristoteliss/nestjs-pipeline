# @nestjs-pipeline/deadletter

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/deadletter.svg)](https://www.npmjs.com/package/@nestjs-pipeline/deadletter)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/deadletter.svg)](https://www.npmjs.com/package/@nestjs-pipeline/deadletter)

Dead-letter capture behavior for `@nestjs-pipeline/core` — when a command, query, or event handler fails (after any retries), it forwards a record of the failed request to a **dead-letter transport** for inspection and replay.

Transport-agnostic: it depends only on a tiny `DeadLetterTransport` interface. **BullMQ**, **RabbitMQ**, and **Postgres** transports are bundled — handlers never change. The bundled transports are typed *structurally*, so this package adds **zero heavy dependencies**; you pass your own `Queue`, AMQP `Channel`, or pg `Pool`.

---

## Table of Contents

- [How it fits CQRS](#how-it-fits-cqrs)
- [Installation](#installation)
- [Setup](#setup)
- [Transports](#transports)
  - [BullMQ](#bullmq)
  - [RabbitMQ (drop-in)](#rabbitmq-drop-in)
  - [Postgres (drop-in)](#postgres-drop-in)
  - [Custom transport](#custom-transport)
- [Behavior](#behavior)
- [Configuration](#configuration)
- [The dead-letter record](#the-dead-letter-record)
- [Ordering with retries](#ordering-with-retries)
- [API Reference](#api-reference)
- [License](#license)

---

## How it fits CQRS

A pipeline command/query is a **synchronous, in-process call** — you can't "park it
for later." So this behavior does the one thing that *is* meaningful in-process:
on final failure it attempts to send the request + error to the configured sink, then:

- **commands/queries** → re-throws (the caller still gets the failure);
- **events** (fire-and-forget) → can optionally **swallow** the handler error with
  `rethrow: false`.

For *retrying* a request right now, use
[`@nestjs-pipeline/resilience`](../pipeline-resilience). This package is about
what happens **after** retries are exhausted.

---

## Installation

```bash
pnpm add @nestjs-pipeline/deadletter
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common reflect-metadata
```

Plus **one** backend client for your chosen transport — e.g. `bullmq`,
`amqplib`, or `pg`. None are hard dependencies of this package.

---

## Setup

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { PipelineModule } from '@nestjs-pipeline/core';
import {
  DeadLetterModule,
  DeadLetterBehavior,
  BullMqDeadLetterTransport,
} from '@nestjs-pipeline/deadletter';
import { Queue } from 'bullmq';

const deadLetterQueue = new Queue('dead-letters', {
  connection: { host: 'localhost', port: 6379 },
});

@Module({
  imports: [
    DeadLetterModule.forRoot({
      transport: new BullMqDeadLetterTransport(deadLetterQueue),
    }),
    // Registers the behavior provider for @UsePipeline/globalBehaviors.
    PipelineModule.forRoot({ behaviors: [DeadLetterBehavior] }),
  ],
})
export class AppModule {}
```

Then opt a handler in per-handler, or configure `DeadLetterBehavior` under
`globalBehaviors` if it should execute globally. The `behaviors` registration
above only makes the provider available to the pipeline.

```typescript
@CommandHandler(CreateUserCommand)
@UsePipeline(DeadLetterBehavior) // attempt capture + re-throw on failure
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {}

@EventsHandler(UserCreatedEvent)
@UsePipeline([DeadLetterBehavior, { rethrow: false }]) // attempt capture + swallow handler error
export class SendWelcomeEmailHandler implements IEventHandler<UserCreatedEvent> {}
```

> Need the queue from Nest's DI (`@nestjs/bullmq`)? Use `forRootAsync` (see below).

---

## Transports

Swapping the backend is a **one-line** change — only the transport passed to
`forRoot`/`forRootAsync` differs. Handlers are untouched.

### BullMQ

Each successful transport send adds a normal job to the dead-letter queue. It
starts in BullMQ's waiting state, not its failed state, so `queue.getFailed()`
and `job.retry()` do not apply. Inspect records with Bull Board or
`queue.getJobs(['waiting', 'delayed', 'active', 'completed'])`, then use an
application-specific replay worker/tool to validate the record and re-dispatch
the original request. Defaults keep jobs around
(`removeOnComplete: false`, `removeOnFail: false`).

```typescript
import { getQueueToken } from '@nestjs/bullmq';
import { BullModule } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

DeadLetterModule.forRootAsync({
  imports: [BullModule.registerQueue({ name: 'dead-letters' })],
  inject: [getQueueToken('dead-letters')],
  useFactory: (queue: Queue) => new BullMqDeadLetterTransport(queue),
});
```

### RabbitMQ (drop-in)

Publishes a persistent JSON message and waits for broker publisher confirmation.
Assert the queue/exchange first and use an `amqplib` confirm channel.

```typescript
import amqp from 'amqplib';
import { RabbitMqDeadLetterTransport } from '@nestjs-pipeline/deadletter';

const conn = await amqp.connect(process.env.AMQP_URL!);
const channel = await conn.createConfirmChannel();
await channel.assertQueue('dead-letters', { durable: true });

DeadLetterModule.forRoot({
  transport: new RabbitMqDeadLetterTransport(channel, { routingKey: 'dead-letters' }),
});
```

### Postgres (drop-in)

Inserts one row per dead letter. Create the table once (the name is validated as
a plain SQL identifier; all values are bound parameters).

```typescript
import { Pool } from 'pg';
import {
  PostgresDeadLetterTransport,
  createDeadLetterTableSql,
} from '@nestjs-pipeline/deadletter';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(createDeadLetterTableSql()); // run in a migration

DeadLetterModule.forRoot({
  transport: new PostgresDeadLetterTransport(pool, { table: 'dead_letters' }),
});
```

### Custom transport

Implement the one-method interface for anything (Kafka, S3, an HTTP webhook, …):

```typescript
import type { DeadLetterTransport, DeadLetterRecord } from '@nestjs-pipeline/deadletter';

class WebhookTransport implements DeadLetterTransport {
  async send(record: DeadLetterRecord): Promise<void> {
    await fetch(process.env.DLQ_WEBHOOK!, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(record),
    });
  }
}
```

---

## Behavior

For each request, `DeadLetterBehavior` runs the handler and, **only on failure**:

1. Resolves effective options (module defaults ← per-handler options).
2. Skips capture if the request kind isn't in `captureKinds` (when set).
3. Builds a transport-neutral [`DeadLetterRecord`](#the-dead-letter-record) and calls
   `transport.send(record)`. A transport failure is logged and **never masks**
   the original handler error.
4. Sets `dead-letter.captured` on `context.items` to whether delivery succeeded.
5. Re-throws the original handler error (`rethrow: true`, default) or resolves to
   `undefined` when `rethrow: false` **and delivery succeeded**. An excluded
   request kind or failed transport always re-throws the original error.

---

## Configuration

Per-handler options via `@UsePipeline([DeadLetterBehavior, options])`, merged
over module-wide `defaults` (handler wins):

| Option | Type | Default | Description |
|---|---|---|---|
| `rethrow` | `boolean` | `true` | Re-throw after capture. `false` swallows only after successful transport delivery. |
| `includeStack` | `boolean` | `true` | Include the error stack in the record. |
| `captureKinds` | `('command'\|'query'\|'event'\|'unknown')[]` | all | Restrict which request kinds are captured. |
| `ignoreErrors` | `Type[] \| ((err, ctx) => boolean)` | — | Error classes or predicate function to skip from dead-letter capture. |
| `metadata` | `(ctx) => Record<string, unknown>` | — | Extra request-aware metadata to attach. |

Module-wide defaults:

```typescript
DeadLetterModule.forRoot({
  transport,
  defaults: {
    includeStack: false,
    captureKinds: ['command', 'event'],
    ignoreErrors: [ZodValidationError],
  },
});
```

---

## The dead-letter record

Transport-neutral. The application-provided payload and metadata must be
serializable by the selected transport; capture can fail otherwise (without
replacing the original handler error under the default fail-open behavior):

```typescript
interface DeadLetterRecord {
  correlationId: string;                 // cross-system tracing id
  requestKind: 'command' | 'query' | 'event' | 'unknown';
  requestName: string;                   // e.g. 'CreateUserCommand'
  handlerName: string;                   // e.g. 'CreateUserHandler'
  payload: unknown;                      // the original request instance
  error: { name: string; message: string; stack?: string };
  failedAt: string;                      // ISO-8601
  metadata?: Record<string, unknown>;    // from the `metadata` factory
}
```

---

## Ordering with validation and retries

Place `DeadLetterBehavior`:
- **Inside** request validation behaviors (e.g. `ZodValidationBehavior`) so malformed client inputs (HTTP 400) fail fast and are never dead-lettered.
- **Outside** retry behaviors (`ResilienceBehavior`) so it attempts capture only after retries are exhausted.
- **Scoped to mutating requests** (commands and events) via `captureKinds: ['command', 'event']` or scoping configs, preventing read query failures from landing in the DLQ.

```typescript
PipelineModule.forRoot({
  globalBehaviors: [
    {
      scope: 'all',
      before: [LoggingBehavior, ZodValidationBehavior],
    },
    {
      scope: 'commands',
      before: [
        [
          DeadLetterBehavior,
          {
            captureKinds: ['command'],
            ignoreErrors: [ZodValidationError],
          },
        ],
      ],
    },
    {
      scope: 'events',
      before: [[DeadLetterBehavior, { captureKinds: ['event'] }]],
    },
  ],
});

// …and per-handler, nest retries closer to the handler:
@UsePipeline([ResilienceBehavior, { retry: { maxAttempts: 5 } }])
```

The chain becomes `Logging → ZodValidation → DeadLetterBehavior → ResilienceBehavior → handler`: validation errors exit immediately, retries happen first, and only exhausted command/event failures reach dead-letter capture.

---

## API Reference

| Export | Type | Description |
|---|---|---|
| `DeadLetterBehavior` | Class | Pipeline behavior — attempts to send failed requests to the transport |
| `DeadLetterModule` | Class | `forRoot(options)` / `forRootAsync(options)` |
| `DeadLetterTransport` | Interface | One-method sink: `send(record)` |
| `DeadLetterRecord` | Interface | Serializable failed-request snapshot |
| `DeadLetterBehaviorOptions` | Interface | `{ rethrow?, includeStack?, captureKinds?, ignoreErrors?, metadata? }` |
| `DeadLetterModuleOptions` / `DeadLetterModuleAsyncOptions` | Interface | Module registration options |
| `BullMqDeadLetterTransport` | Class | Adds a job to a BullMQ queue |
| `RabbitMqDeadLetterTransport` | Class | Publishes a persistent AMQP message |
| `PostgresDeadLetterTransport` | Class | Inserts a row via `pg` |
| `createDeadLetterTableSql` | Function | `CREATE TABLE` DDL for the Postgres transport |
| `buildDeadLetterRecord` | Function | Builds a record from a context + error |
| `DEAD_LETTER_TRANSPORT` / `DEAD_LETTER_DEFAULT_OPTIONS` | Token | Injection tokens |
| `DEAD_LETTER_ITEM` | Symbol | `context.items` exported unique Symbol key set after the capture attempt |


---

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](../../LICENSE) and [`COMMERCIAL_LICENSE.txt`](../../COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
