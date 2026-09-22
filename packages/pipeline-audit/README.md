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
failure. If the sink throws while `failOpen: false`:
- on the success path, the sink error propagates, failing the request;
- on the handler-failure path, `AuditBehavior` preserves the original handler error and attaches the sink error as `error.cause` (safely checking `Object.isExtensible`), ensuring the root cause is never hidden while recording the sink failure.
The produced record is also stashed on `context.items` under `AUDIT_RECORD_ITEM`
for any later behavior to read.

Opt in per handler with options:

```typescript
import { CommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { audit } from '@nestjs-pipeline/audit';

@CommandHandler(DeleteUserCommand)
@UsePipeline(
  audit({
    action: 'user.delete',
    severity: 'high',
    actor: (c) => ({ id: c.items.get('currentUserId') as string }),
  }),
)
export class DeleteUserHandler { /* ... */ }
```

> The raw tuple form `@UsePipeline([AuditBehavior, { ... }])` remains supported as an escape hatch.

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

Non-plain values are cloned rather than returned by reference. `Map` entries,
`Set` values, and enumerable `Error` properties are traversed recursively, so a
sensitive string key such as `token` is masked there as well. Dates, regular
expressions, buffers, array buffers, and typed views retain their value in the
clone. Cyclic references are rendered as `'[Circular]'`.

The bundled JSON sinks encode values that native `JSON.stringify()` would
collapse using tagged objects such as `{ "$type": "Map", "entries": [...] }`,
`{ "$type": "Set", "values": [...] }`, and explicit `RegExp`, `Error`, binary,
non-finite-number, and array-hole representations. The console and Postgres
sinks therefore preserve the same information after redaction.

---

## Resolving the actor

The behavior itself doesn't know *who* the caller is — resolve it from trusted
session context or pipeline context.

### Module-wide trusted actor defaults

Configure a trusted actor factory once in `AuditModule.forRoot({ defaults: { actor: ... } })`
so that handlers don't need to duplicate actor resolution:

```typescript
AuditModule.forRoot({
  defaults: {
    actor: (ctx) => {
      const user = getSessionUserFromStore();
      if (!user) return { authenticated: false };
      return {
        id: user.id,
        authenticated: true,
        principalType: user.principalType,
        email: user.email,
      };
    },
  },
});
```

### Security requirements for actor resolution

- **Never trust caller-supplied request body fields:** An actor factory must resolve the principal from trusted session context, tokens, or `context.items` set by an upstream authentication behavior/interceptor. Using a request body field (like `req.email`) allows unverified identities to pollute the audit trail.
- **Explicit unauthenticated status:** When no principal is in scope, return `{ authenticated: false }` (or omit `id`) rather than fabricating an `'anonymous'` identity that could be misread as an authenticated principal.
- **Per-handler override:** Individual handlers can still override the actor factory if a specific operation has different principal semantics.

---

## Fail-open vs fail-closed

When the **sink itself** throws (e.g. the audit DB is down):

- **`failOpen: true`** (default) — the failure is logged as a warning and ignored.
  A successful handler still returns its response, and if the handler had failed,
  its original error remains the error seen by the caller. Favors availability.
- **`failOpen: false`** — strictly enforces audit persistence:
  - If the handler succeeded, the sink error is propagated, rejecting the request because the required audit trail could not be recorded.
  - If the handler had already failed, `AuditBehavior` re-throws the original handler error and attaches the sink recording error as `error.cause` (guarded with `Object.isExtensible(error)`), preserving both the business failure and the audit failure details without masking the root exception.

Record construction and sink failures both follow `failOpen`. When handling an
already failed request, the original request error is preserved.

Diagnostic logging of an audit failure is itself fail-open: a logger that throws
never replaces the handler's result or error.

`actor`, `metadata` and `redact` must be functions. A non-function value fails
application bootstrap with a `PipelineConfigurationError`. Module defaults of a
request-scoped `AuditBehavior` have no instance at bootstrap; an invalid default
there is rejected before the handler runs (logged and ignored with
`failOpen: true`).

---

## API Reference

| Export | Kind | Description |
|---|---|---|
| `AuditBehavior` | class | The pipeline behavior |
| `audit` | fn | Type-safe intent builder returning `[AuditBehavior, options]` |
| `AuditIntentOptions` | type | Options for `audit(...)` |
| `AuditModule` | class | `forRoot` / `forRootAsync` registration |
| `AUDIT_RECORD_ITEM` | symbol | `context.items` exported unique Symbol key holding the produced record |
| `AUDIT_RECORD_ITEM_TOKEN` | `PipelineItemToken<AuditRecord>` | Typed token over the same key, for `getPipelineItem` |

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
