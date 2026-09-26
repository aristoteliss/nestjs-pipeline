# @nestjs-pipeline/audit

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/audit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/audit)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/audit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/audit)

Audit-trail behavior for `@nestjs-pipeline/core` — records **who did what, when, and with what outcome** for every command (and, when listed in `captureKinds`, every query or event handler), and forwards the record to a pluggable **audit sink**. Captured application values must satisfy that sink's serialization requirements.

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
- [Architecture and delivery guarantees](#architecture-and-delivery-guarantees)
- [Recording the audit row atomically with the business write](#recording-the-audit-row-atomically-with-the-business-write)
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

It generalizes the [Audit-Trail example](https://github.com/aristoteliss/nestjs-pipeline/blob/master/README.md#example-audit-trail-behavior-with-options)
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
    // Zero-config: audit every command to the console.
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

A sink implements `AuditSink`: `write`, and optionally `begin`:

```typescript
interface AuditSink {
  write(record: AuditRecord): Promise<void> | void;
  begin?(record: AuditStartRecord): Promise<void> | void;
}
```

`begin` receives a pending record before the handler runs; `write` receives the
final record under the same `id` and must replace it. A durable sink should
implement both (see [Architecture and delivery guarantees](#architecture-and-delivery-guarantees)).

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

Implements `begin` and `write`: it inserts a `pending` row when a command starts
and completes that row (`INSERT … ON CONFLICT (id) DO UPDATE`) when it finishes.
Create the table once with `createAuditTableSql`.

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
>
> PostgreSQL `jsonb` cannot hold a NUL character or a lone UTF-16 surrogate, and
> rejects the whole `INSERT` when a value contains one. The sink stores each such
> character as U+FFFD (`�`) instead, so the record is kept.
>
> A row still `pending` long after it started is an attempt interrupted by a
> process stop; its outcome is unknown. `duration_ms` and `completed_at` stay null:
>
> ```sql
> SELECT * FROM audit_log
> WHERE outcome = 'pending' AND occurred_at < now() - interval '1 hour';
> ```

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
- on the handler-failure path, the caller receives the handler's own error, unchanged, and the sink error is logged.
The produced record is also stashed on `context.items` under `AUDIT_RECORD_ITEM`
for any later behavior to read.

When the sink implements `begin` (and `recordStart` is not `false`), a pending
start record is written **before** the handler runs and stashed under
`AUDIT_START_RECORD_ITEM_TOKEN`; the final record reuses its `id`.

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

## Architecture and delivery guarantees

`AuditBehavior` is a pipeline step around the handler. It never sees the
handler's database transaction: every sink call is a separate operation.

For each audited request (commands only, unless `captureKinds` lists more):

1. **Start** — when the sink implements `begin`, build the pending
   `AuditStartRecord` (actor, action, redacted payload, `outcome: 'pending'`) and
   call `sink.begin(record)`. Stash it under `AUDIT_START_RECORD_ITEM_TOKEN`.
2. **Handler** — `next()` runs the rest of the pipeline and the handler, which
   commits its own changes.
3. **Finish** — build the final `AuditRecord` under the same `id` (`success` or
   `failure`, duration, optional response, error) and call `sink.write(record)`.
   Stash it under `AUDIT_RECORD_ITEM`.

What survives a process stop at each point:

| Stop happens | Sink with `begin` (Postgres) | Sink without `begin` (console) |
|---|---|---|
| before step 1 completes | no row, and the handler did not run | no line, and the handler did not run |
| during step 2 or before step 3 completes | a `pending` row: the attempt is known, its outcome is not | nothing: the attempt is lost |
| after step 3 | the final row | the final line |

Two consequences follow:

- A `pending` row does **not** say whether the handler's changes committed. Treat
  it as "outcome unknown" and reconcile it against the business data.
- With `failOpen: false`, a failed `begin` stops the request **before** the
  handler runs: no audit, no action. A failed final `write` fails a successful
  request, but the handler's changes are already committed; the row stays
  `pending`.

These guarantees hold for any sink and any database, because the behavior does
not need to join the handler's transaction. What they do not give is an audit
row that commits **together** with the business change. That needs the
application's cooperation, described next.

---

## Recording the audit row atomically with the business write

The only way to guarantee "a committed change always has its audit row, and a
rolled-back change has none" is to insert the audit row **in the same database
transaction** as the business change. A pipeline behavior cannot do that on its
own: it runs outside the handler and cannot see its unit of work. The
application must do it in its persistence layer.

**The pattern (a transactional audit record):**

1. Use a sink whose `begin` stores nothing and whose `write` completes a row by
   `id` (an upsert, like `PostgresAuditSink.write`). `begin` must exist so that
   the pending record is built and stashed.
2. In the handler's repository, inside the transaction that writes the business
   change, read the pending record with `getPipelineItem(context,
   AUDIT_START_RECORD_ITEM_TOKEN)` (or pass it in from the handler) and insert it
   into the audit table.
3. After the handler returns, the behavior's `write` completes that row with the
   outcome. If the transaction rolled back, `write` inserts a `failure` row; if
   the process stops before `write`, the committed row stays `pending` but its
   business change is known to have committed.

```typescript
import { AuditModule, type AuditSink } from '@nestjs-pipeline/audit';

class TransactionalAuditSink implements AuditSink {
  constructor(private readonly completing: PostgresAuditSink) {}

  begin(): void {
    // The repository inserts the pending row in its own transaction.
  }

  write(record: AuditRecord): Promise<void> {
    return this.completing.write(record); // upsert by id
  }
}
```

**Checklist for doing it properly:**

- The audit table lives in the **same database** as the business data, and the
  insert runs on the **same connection and transaction** as the business write.
- Completion is **idempotent by `id`** (an upsert), so a retried `write`, or a
  `write` without a stored start row, is safe.
- The row is **redacted before storage**: use the record from the token, never
  the raw request.
- A **reconciliation job** handles rows left `pending` (compare with the
  business data, then mark them).
- If a message broker must also receive the audit event, publish it from the
  stored row (a transactional outbox), not from the request path.

**Limit with autocommit-only repositories:** some write sides refuse to run
inside an outer transaction, because they acknowledge the write (advance a
version, update a cache) as soon as their statement succeeds, which would be
wrong after a rollback they cannot observe. Such a repository cannot share a
transaction with the audit insert until it gains commit hooks (acknowledgment
and cache work run after the commit). Until then, rely on the two-phase
guarantees above.

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
| `recordStart` | `boolean` | `true` | Write a pending start record first, when the sink implements `begin` |
| `captureKinds` | `AuditRequestKind[]` | `['command']` | Request kinds to audit; list `'query'` or `'event'` to audit them too |
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
  - If the handler had already failed, `AuditBehavior` re-throws the handler's own error, unchanged, and logs the sink error. The error object is never modified.

Record construction and sink failures both follow `failOpen`. When handling an
already failed request, the original request error is preserved.

The start record follows the same rule, one step earlier: when building it or
`sink.begin` fails, `failOpen: true` logs the failure and runs the handler, and
`failOpen: false` rejects the request **before the handler runs**.

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
| `AUDIT_START_RECORD_ITEM_TOKEN` | `PipelineItemToken<AuditStartRecord>` | The pending start record, set before the handler runs |
| `AUDIT_SINK` / `AUDIT_DEFAULT_OPTIONS` | token | DI tokens |
| `LogAuditSink` | class | Default zero-dep sink |
| `PostgresAuditSink` | class | Postgres drop-in sink |
| `createAuditTableSql` | fn | `CREATE TABLE` DDL for the Postgres sink |
| `buildAuditRecord` / `buildAuditStartRecord` | fn | Pure builders of the final and the pending record (used by the behavior) |
| `redactValue` / `DEFAULT_REDACT_KEYS` / `REDACTED` | fn/const | Redaction helpers |
| `AuditSink`, `AuditRecord`, `AuditStartRecord`, `AuditBehaviorOptions`, … | type | Public types |

---

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
