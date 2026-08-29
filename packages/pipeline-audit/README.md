# @nestjs-pipeline/audit

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/audit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/audit)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/audit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/audit)

Audit-trail behavior for `@nestjs-pipeline/core` — records **who did what, when, and with what outcome** for every command, query, and event handler, and forwards the record to a pluggable **audit sink**. Captured application values must satisfy that sink's serialization requirements.

Sink-agnostic: it depends only on a tiny `AuditSink` interface. A zero-dependency **console** sink is the default; **Postgres** is a genuine drop-in, and your own sink (event store, Kafka, HTTP collector, …) is a one-line swap — handlers never change. Records are written on **both success and failure**, sensitive payload fields are **redacted** by default, and the actor can be resolved from the pipeline context.

---

## Table of Contents

- [Why a behavior (vs. hand-rolling)](#why-a-behavior-vs-hand-rolling)
- [Installation](#installation)
- [Setup](#setup)
- [The audit record](#the-audit-record)
- [Sinks](#sinks)
  - [Console (default)](#console-default)
  - [Postgres (drop-in)](#postgres-drop-in)
  - [Custom sink](#custom-sink)
- [Behavior](#behavior)
- [Configuration](#configuration)
- [Redaction](#redaction)
- [Resolving the actor](#resolving-the-actor)
- [Fail-open vs fail-closed](#fail-open-vs-fail-closed)
- [API Reference](#api-reference)
- [License](#license)

---

## Why a behavior (vs. hand-rolling)

An audit trail is a classic cross-cutting concern: the same "record who did what"
logic is needed on dozens of handlers. Writing it inline couples every handler to
your audit storage and is easy to get wrong (forgetting failures, leaking
passwords, missing the actor). This behavior centralizes it:

- **Success *and* failure** — denied/rejected attempts are audited too (the part
  most hand-rolled trails miss). With the default `failOpen: true`, a handler
  failure is re-thrown unchanged even if the audit sink also fails.
- **Redaction built in** — `password`, `token`, `secret`, … are masked before
  anything is stored.
- **Actor resolution** — pull the acting principal from `context.items` populated
  by an upstream auth behavior.
- **One seam** — the `AuditSink` interface. Console today, Postgres or your event
  store tomorrow, with no handler changes.

It generalizes the [Audit-Trail example](../../README.md#example-audit-trail-behavior-with-options)
from the root README into a reusable, redaction-aware, outcome-aware package.

---

## Installation

```bash
pnpm add @nestjs-pipeline/audit
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common reflect-metadata
```

The bundled sinks are typed *structurally*, so this package adds **zero heavy
dependencies**. For the Postgres sink, add a `pg` `Pool`/`Client` in your app
(`pnpm add pg`); the console sink needs nothing.

---

## Setup

Register the module and add `AuditBehavior` to your global behaviors (or
per-handler via `@UsePipeline`).

```typescript
import { Module } from '@nestjs/common';
import { PipelineModule } from '@nestjs-pipeline/core';
import { AuditModule, AuditBehavior } from '@nestjs-pipeline/audit';

@Module({
  imports: [
    // Zero-config: audit every handler to the console.
    AuditModule.forRoot(),
    PipelineModule.forRoot({
      globalBehaviors: { scope: 'all', before: [AuditBehavior] },
    }),
  ],
})
export class AppModule {}
```

> **Ordering:** place `AuditBehavior` near the **outside** of the chain so its
> duration covers the whole handler, and **after** any auth behavior that
> populates `context.items` for the [`actor`](#resolving-the-actor) factory.

---

## The audit record

Every audited run produces one `AuditRecord`, forwarded to the sink:

```jsonc
{
  "id": "0d3f…",                       // UUID per entry
  "correlationId": "019728a3-…",
  "action": "user.create",             // defaults to requestName
  "severity": "medium",                // 'low' | 'medium' | 'high' | 'critical'
  "outcome": "success",                // or 'failure'
  "actor": { "id": "admin-1" },        // resolved from context (optional)
  "requestKind": "command",
  "requestName": "CreateUserCommand",
  "handlerName": "CreateUserHandler",
  "payload": { "username": "jane", "password": "[REDACTED]" },
  "response": undefined,               // only when captureResponse: true
  "error": undefined,                  // present on failure
  "durationMs": 12.3,
  "timestamp": "2026-03-01T12:00:00.000Z",
  "metadata": { "tenant": "acme" }     // optional
}
```

---

## Sinks

A sink implements a single method — `AuditSink`:

```typescript
interface AuditSink {
  write(record: AuditRecord): Promise<void> | void;
}
```

### Console (default)

Zero-dependency; writes each record as a JSON line. Successes go to `log`,
failures to `warn`. Used automatically when no `sink` is passed.

```typescript
import { Logger } from '@nestjs/common';
import { LogAuditSink } from '@nestjs-pipeline/audit';

AuditModule.forRoot({
  sink: new LogAuditSink({ logger: new Logger('Audit'), pretty: true }),
});
```

### Postgres (drop-in)

Inserts each record as a row. Create the table once with `createAuditTableSql`.

```typescript
import { Pool } from 'pg';
import {
  AuditModule,
  PostgresAuditSink,
  createAuditTableSql,
} from '@nestjs-pipeline/audit';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(createAuditTableSql()); // → table "audit_log"

@Module({
  imports: [
    AuditModule.forRoot({
      sink: new PostgresAuditSink(pool, { table: 'audit_log' }),
    }),
  ],
})
export class AppModule {}
```

Or build it from a DI-managed pool with `forRootAsync`:

```typescript
AuditModule.forRootAsync({
  inject: [PG_POOL],
  useFactory: (pool: Pool) => new PostgresAuditSink(pool),
});
```

> The table name is validated as a plain SQL identifier (interpolated, not
> parameterized); every record value is passed as a **bound parameter**.

### Custom sink

Anything that matches `AuditSink` works — an event store, Kafka, an HTTP
collector, your domain repository:

```typescript
import { AuditSink, AuditRecord } from '@nestjs-pipeline/audit';

export class KafkaAuditSink implements AuditSink {
  constructor(private readonly producer: Producer) {}

  async write(record: AuditRecord): Promise<void> {
    await this.producer.send({
      topic: 'audit',
      messages: [{ key: record.correlationId, value: JSON.stringify(record) }],
    });
  }
}

AuditModule.forRoot({ sink: new KafkaAuditSink(producer) });
```

---

## Behavior

`AuditBehavior` times the handler, builds an `AuditRecord`, and writes it to the
sink. On success it returns the handler response after the sink write. On handler
failure it attempts to write the failure record and then re-throws the original
handler error when the sink write succeeds or `failOpen: true` suppresses a sink
failure. If the sink throws while `failOpen: false`, that sink error propagates;
on the handler-failure path it can therefore replace the original handler error.
The produced record is also stashed on `context.items` under `AUDIT_RECORD_ITEM`
for any later behavior to read.

Opt in per handler with options:

```typescript
import { CommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { AuditBehavior } from '@nestjs-pipeline/audit';

@CommandHandler(DeleteUserCommand)
@UsePipeline([
  AuditBehavior,
  {
    action: 'user.delete',
    severity: 'high',
    actor: (c) => ({ id: c.items.get('currentUserId') as string }),
  },
])
export class DeleteUserHandler { /* ... */ }
```

---

## Configuration

Per-handler options (`AuditBehaviorOptions`) shallow-merge over the module
defaults passed to `AuditModule.forRoot({ defaults })`:

| Option | Type | Default | Description |
|---|---|---|---|
| `action` | `string` | `context.requestName` | Logical action name on the record |
| `severity` | `'low' \| 'medium' \| 'high' \| 'critical'` | `'medium'` (`'low'` for queries) | Importance, for filtering/alerting |
| `actor` | `(ctx) => AuditActor \| undefined` | — | Resolve the acting principal |
| `captureRequest` | `boolean` | `true` | Record the (redacted) request payload |
| `captureResponse` | `boolean` | `false` | Record the (redacted) handler response |
| `captureKinds` | `AuditRequestKind[]` | all | Restrict auditing to specific kinds |
| `redactKeys` | `string[]` | — | Extra field names to mask (merged with defaults) |
| `redact` | `(value) => unknown` | — | Full custom redactor (replaces key-masking) |
| `metadata` | `(ctx) => object` | — | Extra metadata merged into the record |
| `includeStack` | `boolean` | `true` | Include the error stack on failure records |
| `failOpen` | `boolean` | `true` | Log/ignore sink failures (`true`) or propagate the sink error (`false`) |

---

## Redaction

Before a payload or response is stored, the values of sensitive keys are replaced
with `'[REDACTED]'`. The built-in `DEFAULT_REDACT_KEYS` cover common secrets
(`password`, `pwd`, `token`, `accessToken`, `refreshToken`, `secret`, `apiKey`,
`authorization`, `cookie`, `ssn`, `creditCard`, `cardNumber`, `cvv`). Matching is
**case-insensitive** and recurses into nested objects and arrays.

```typescript
// Add app-specific keys (merged with the defaults):
@UsePipeline([AuditBehavior, { redactKeys: ['pin', 'iban'] }])

// Or take full control:
@UsePipeline([AuditBehavior, {
  redact: (payload) => ({ summary: summarize(payload) }),
}])
```

`Date`, `Buffer`, and other non-plain objects are passed through untouched, and
cyclic references are rendered as `'[Circular]'`.

---

## Resolving the actor

The behavior itself doesn't know *who* the caller is — resolve it from the
pipeline context. A common pattern: an upstream behavior writes the user id to
`context.items`, and the `actor` factory reads it.

```typescript
// AuthBehavior (runs before AuditBehavior)
context.items.set('currentUserId', user.id);

// Anywhere you audit
@UsePipeline([AuditBehavior, {
  actor: (c) => ({
    id: c.items.get('currentUserId') as string,
    correlationId: c.correlationId,
  }),
}])
```

---

## Fail-open vs fail-closed

When the **sink itself** throws (e.g. the audit DB is down):

- **`failOpen: true`** (default) — the failure is logged as a warning and ignored.
  A successful handler still returns its response, and if the handler had failed,
  its original error remains the error seen by the caller. Favors availability.
- **`failOpen: false`** — the sink error is propagated, failing the request. If
  the handler had already failed, the sink write happens in that error path, so
  the sink error replaces the handler error. Favors a fail-closed audit policy.

Building the record never throws into your request; only the sink write is
governed by `failOpen`.

---

## API Reference

| Export | Kind | Description |
|---|---|---|
| `AuditBehavior` | class | The pipeline behavior |
| `AuditModule` | class | `forRoot` / `forRootAsync` registration |
| `AUDIT_RECORD_ITEM` | const | `context.items` key holding the produced record |
| `AUDIT_SINK` / `AUDIT_DEFAULT_OPTIONS` | token | DI tokens |
| `LogAuditSink` | class | Default zero-dep sink |
| `PostgresAuditSink` | class | Postgres drop-in sink |
| `createAuditTableSql` | fn | `CREATE TABLE` DDL for the Postgres sink |
| `buildAuditRecord` | fn | Pure record builder (used by the behavior) |
| `redactValue` / `DEFAULT_REDACT_KEYS` / `REDACTED` | fn/const | Redaction helpers |
| `AuditSink`, `AuditRecord`, `AuditBehaviorOptions`, … | type | Public types |

---

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](../../LICENSE) and [`COMMERCIAL_LICENSE.txt`](../../COMMERCIAL_LICENSE.txt)
at the repository root.
