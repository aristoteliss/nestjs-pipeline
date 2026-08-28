# @nestjs-pipeline/idempotency

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/idempotency.svg)](https://www.npmjs.com/package/@nestjs-pipeline/idempotency)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/idempotency.svg)](https://www.npmjs.com/package/@nestjs-pipeline/idempotency)

Idempotency behavior for `@nestjs-pipeline/core` — atomically deduplicates concurrent requests sharing an idempotency key and **replays the stored response** after a successful execution. With the default `releaseOnError: true`, failed executions release the key so a later retry may execute the handler again.

Store-agnostic: it depends only on a tiny `IdempotencyStore` interface. A zero-dependency **in-memory** store is the default; **Redis** and **Postgres** are genuine drop-ins for multi-instance deployments, and your own store is a one-line swap — handlers never change.

---

## Table of Contents

- [Why a behavior (vs. hand-rolling)](#why-a-behavior-vs-hand-rolling)
- [Installation](#installation)
- [Setup](#setup)
- [The idempotency record](#the-idempotency-record)
- [Stores](#stores)
  - [Memory (default)](#memory-default)
  - [Redis (drop-in)](#redis-drop-in)
  - [Postgres (drop-in)](#postgres-drop-in)
  - [Custom store](#custom-store)
- [Behavior](#behavior)
- [Configuration](#configuration)
- [Fingerprinting & key reuse](#fingerprinting--key-reuse)
- [Conflict handling](#conflict-handling)
- [API Reference](#api-reference)
- [License](#license)

---

## Why a behavior (vs. hand-rolling)

Idempotency is a classic cross-cutting concern: the same "have I already done
this?" check is needed on every state-changing handler that a client might retry.
Inlining it couples each handler to your dedupe storage and is easy to get subtly
wrong (races between the check and the write, never replaying the original
response, leaking partial writes after a crash). This behavior centralizes it:

- **Atomic exclusion** — the key is claimed **atomically** before the handler runs
  (`SET NX` on Redis, `INSERT … ON CONFLICT DO NOTHING` on Postgres), so two
  concurrent duplicates cannot both execute while the claim is live.
- **Response replay** — after a successful execution, the response is stored and
  returned to later duplicates without running the handler again while the record
  remains live.
- **Failure policy** — handler failures release the key by default
  (`releaseOnError: true`), allowing a later retry to execute again. Set
  `releaseOnError: false` when retaining the failed claim is preferable.
- **In-flight protection** — a duplicate that arrives while the original is still
  running gets a `409 Conflict` instead of racing it.
- **Payload safety** — an optional fingerprint rejects a key reused with a
  *different* body (`422`), catching client bugs and replay attacks.
- **One seam** — the `IdempotencyStore` interface. Memory today, Redis or Postgres
  the moment you scale past one instance, with no handler changes.

---

## Installation

```bash
pnpm add @nestjs-pipeline/idempotency
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common reflect-metadata
```

The bundled stores are typed *structurally*, so this package adds **zero heavy
dependencies**. For the Redis store add a `redis` client (`pnpm add redis`); for
the Postgres store add a `pg` `Pool`/`Client` (`pnpm add pg`); the memory store
needs nothing.

---

## Setup

Register the module and add `IdempotencyBehavior` to a handler via `@UsePipeline`
(or to your global behaviors). The behavior only acts when a `keyFactory`
produces a key, so it is safe to enable broadly.

```typescript
import { Module } from '@nestjs/common';
import { PipelineModule } from '@nestjs-pipeline/core';
import {
  IdempotencyModule,
  IdempotencyBehavior,
} from '@nestjs-pipeline/idempotency';

@Module({
  imports: [
    // Zero-config: in-memory dedupe (single instance).
    IdempotencyModule.forRoot(),
    PipelineModule.forRoot(),
  ],
})
export class AppModule {}
```

Then opt a command in and tell the behavior how to derive its key — typically an
`Idempotency-Key` header your controller stashes on the context:

```typescript
@CommandHandler(CreatePaymentCommand)
@UsePipeline([
  IdempotencyBehavior,
  {
    keyFactory: (ctx) => ctx.items.get('idempotencyKey') as string | undefined,
    ttl: 86_400_000, // 24h (default)
  },
])
export class CreatePaymentHandler {
  async execute(command: CreatePaymentCommand) {
    /* concurrent duplicates are excluded; successful responses are replayed */
  }
}
```

---

## The idempotency record

Each claimed key stores an `IdempotencyRecord`:

```typescript
interface IdempotencyRecord {
  key: string;                          // the idempotency key
  status: 'in_progress' | 'completed';  // lifecycle state
  requestName: string;                  // e.g. 'CreatePaymentCommand'
  fingerprint?: string;                 // hash of the original payload
  response?: unknown;                   // captured once completed (for replay)
  createdAt: string;                    // ISO-8601, when first claimed
  completedAt?: string;                 // ISO-8601, when the handler finished
}
```

The record is created as `in_progress` the instant the key is claimed, then
flipped to `completed` with the captured `response` when the handler succeeds.

---

## Stores

The store is the only backend-specific piece. Swap it in `IdempotencyModule`
without touching any handler.

### Memory (default)

`MemoryIdempotencyStore` — zero dependencies, a `Map` with per-entry TTL. Perfect
for a single instance, tests, or local development. State is **not** shared across
processes, so use Redis or Postgres for multi-instance deployments.

```typescript
IdempotencyModule.forRoot(); // memory store, 24h default TTL
```

### Redis (drop-in)

`RedisIdempotencyStore` — backed by a `redis` (node-redis v4) client. Atomic
claims via `SET key value PX <ttl> NX`; TTL is enforced by Redis.

```typescript
import { createClient } from 'redis';
import {
  IdempotencyModule,
  RedisIdempotencyStore,
} from '@nestjs-pipeline/idempotency';

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

IdempotencyModule.forRoot({
  store: new RedisIdempotencyStore(client, { keyPrefix: 'idempotency:' }),
});
```

Wire a DI-managed client with `forRootAsync`:

```typescript
IdempotencyModule.forRootAsync({
  inject: [REDIS_CLIENT],
  useFactory: (client) => new RedisIdempotencyStore(client),
});
```

### Postgres (drop-in)

`PostgresIdempotencyStore` — backed by a `pg` `Pool`/`Client`. No extra
infrastructure if you already run Postgres. Create the table once with
`createIdempotencyTableSql()`; claims are atomic via
`INSERT … ON CONFLICT (key) DO NOTHING`.

```typescript
import { Pool } from 'pg';
import {
  IdempotencyModule,
  PostgresIdempotencyStore,
  createIdempotencyTableSql,
} from '@nestjs-pipeline/idempotency';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(createIdempotencyTableSql()); // run in a migration

IdempotencyModule.forRootAsync({
  inject: [PG_POOL],
  useFactory: (pool: Pool) => new PostgresIdempotencyStore(pool),
});
```

### Custom store

Implement the four-method `IdempotencyStore` interface to back idempotency with
anything — DynamoDB, Memcached, an HTTP service:

```typescript
interface IdempotencyStore {
  get(key: string): MaybePromise<IdempotencyRecord | undefined>;
  /** Atomically claim a key. Returns false if a live record already exists. */
  setIfAbsent(
    key: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): MaybePromise<boolean>;
  set(key: string, record: IdempotencyRecord, ttlMs: number): MaybePromise<void>;
  delete(key: string): MaybePromise<void>;
}
```

`setIfAbsent` **must** be atomic to prevent concurrent duplicates from both
claiming the same live key.

---

## Behavior

For each in-scope request `IdempotencyBehavior`:

1. derives the key via `keyFactory`; if none, the handler runs normally;
2. exposes the key on the context as `IDEMPOTENCY_KEY_ITEM` (`'idempotency.key'`);
3. atomically claims the key (`status: 'in_progress'`);
4. **claimed** → runs the handler, stores the `completed` record with the
   response, and returns it;
5. **not claimed** → looks at the existing record:
   - still `in_progress` → throws `IdempotencyConflictError` (`409`);
   - `completed`, same payload → **replays** the stored response (handler does
     not run) and sets `IDEMPOTENCY_REPLAYED_ITEM` (`'idempotency.replayed'`) to
     `true`;
   - `completed`, different payload → throws `IdempotencyConflictError` (`422`).

If the handler throws and `releaseOnError` is `true` (default), the key is
released so the client can retry and the handler may execute again. The handler
error is re-thrown after the cleanup attempt. If cleanup itself fails, that
cleanup failure is logged and the handler error is still re-thrown.

---

## Configuration

Options are read per-handler from `@UsePipeline` and merged over module-wide
`defaults`.

| Option           | Type                                            | Default        | Description                                                                       |
| ---------------- | ----------------------------------------------- | -------------- | --------------------------------------------------------------------------------- |
| `keyFactory`     | `(ctx) => string \| undefined`                  | —              | Derives the idempotency key. Without one (or when it returns `undefined`) the handler runs normally. |
| `ttl`            | `number`                                        | `86_400_000`   | How long a key is remembered, in ms (24h). After this it may be reused.            |
| `scope`          | `('command' \| 'query' \| 'event' \| 'unknown')[]` | `['command']`  | Which request kinds the policy applies to.                                         |
| `fingerprint`    | `boolean`                                        | `true`         | Reject a key reused with a different payload (`422`).                              |
| `releaseOnError` | `boolean`                                        | `true`         | Release the key when the handler throws, so retries can re-run.                    |

---

## Fingerprinting & key reuse

With `fingerprint: true` (default) the behavior stores a stable SHA-256 hash of
the request payload (object keys sorted, so property order doesn't matter). If a
later request reuses the key with a **different** body, it is rejected with a
`422` `key_reuse` conflict — catching client bugs and replay attacks where the
same key is sent with new data.

Disable it (`fingerprint: false`) when your key already fully identifies the
payload, or expose `fingerprintValue` to compute a hash yourself.

---

## Conflict handling

`IdempotencyConflictError` carries `key`, `requestName`, `reason`
(`'in_progress'` | `'key_reuse'`) and a suggested `statusCode` (`409` / `422`).
Map it to an HTTP response with the bundled filter (Express **and** Fastify):

```typescript
import { IdempotencyConflictFilter } from '@nestjs-pipeline/idempotency';

app.useGlobalFilters(new IdempotencyConflictFilter());
```

Response body:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "A request with idempotency key \"…\" is already in progress for CreatePaymentCommand",
  "idempotencyKey": "…",
  "reason": "in_progress"
}
```

---

## API Reference

**Module**

- `IdempotencyModule.forRoot(options?)` — `{ store?, defaults? }`; defaults to the
  memory store.
- `IdempotencyModule.forRootAsync(options)` — `{ useFactory, inject?, imports?, defaults? }`.

**Behavior**

- `IdempotencyBehavior` — the pipeline behavior.
- `IDEMPOTENCY_KEY_ITEM`, `IDEMPOTENCY_REPLAYED_ITEM` — context item keys.

**Stores**

- `MemoryIdempotencyStore` — default, zero-dependency.
- `RedisIdempotencyStore` — `(client, { keyPrefix? })`; `RedisClientLike`.
- `PostgresIdempotencyStore` — `(db, { table? })`; `createIdempotencyTableSql(table?)`,
  `PostgresQueryableLike`.

**Errors & filter**

- `IdempotencyConflictError` — `{ key, requestName, reason, statusCode }`.
- `IdempotencyConflictFilter` — maps it to `409` / `422`.

**Helpers & tokens**

- `fingerprintValue(value)`, `stableStringify(value)`.
- `IDEMPOTENCY_STORE`, `IDEMPOTENCY_DEFAULT_OPTIONS`, `DEFAULT_IDEMPOTENCY_TTL_MS`.

**Types**

- `IdempotencyStore`, `IdempotencyRecord`, `IdempotencyStatus`,
  `IdempotencyRequestKind`, `IdempotencyBehaviorOptions`, `IdempotencyKeyFactory`,
  `IdempotencyModuleOptions`, `IdempotencyModuleAsyncOptions`, `MaybePromise`.

---

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**.
See [LICENSE](../../LICENSE) and [COMMERCIAL_LICENSE.txt](../../COMMERCIAL_LICENSE.txt).
