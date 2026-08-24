# @nestjs-pipeline/rate-limit

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/rate-limit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/rate-limit)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/rate-limit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/rate-limit)

Rate-limiting behavior for `@nestjs-pipeline/core` — consumes points from a bucket before a command, query, or event handler runs, and throws `RateLimitExceededError` (→ HTTP `429`) when the bucket is exhausted.

Backend-agnostic: it depends only on a tiny `RateLimiterLike` interface, satisfied by every [`rate-limiter-flexible`](https://www.npmjs.com/package/rate-limiter-flexible) backend — **memory**, **Redis/Valkey**, **Mongo**, **Postgres**, **MySQL**. The interface is typed *structurally*, so this package adds **zero heavy dependencies**; you pass your own limiter. Don't hand-roll distributed rate limiting — `rate-limiter-flexible` gives you atomic counters and race-free windows.

---

## Table of Contents

- [Why rate-limiter-flexible](#why-rate-limiter-flexible)
- [Installation](#installation)
- [Setup](#setup)
- [Backends](#backends)
- [Behavior](#behavior)
- [Configuration](#configuration)
- [Keying strategy](#keying-strategy)
- [HTTP 429 filter](#http-429-filter)
- [Fail-open vs fail-closed](#fail-open-vs-fail-closed)
- [API Reference](#api-reference)
- [License](#license)

---

## Why rate-limiter-flexible

Correct rate limiting needs **atomic** counters so concurrent requests can't
overspend a window — that's a distributed-systems problem you shouldn't solve by
hand. `rate-limiter-flexible` provides race-free counters across memory, Redis,
Mongo, and SQL with a single `consume(key, points)` API. This behavior wraps that
one call into the pipeline and maps an exhausted bucket to a typed error.

---

## Installation

```bash
pnpm add @nestjs-pipeline/rate-limit rate-limiter-flexible
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common reflect-metadata
```

> `rate-limiter-flexible` is **not** a hard dependency of this package — you pass
> your own limiter instance, so only the backend you actually use is loaded.

---

## Setup

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { PipelineModule } from '@nestjs-pipeline/core';
import { RateLimitModule, RateLimitBehavior } from '@nestjs-pipeline/rate-limit';
import { RateLimiterMemory } from 'rate-limiter-flexible';

@Module({
  imports: [
    RateLimitModule.forRoot({
      // 10 points per second, shared default for every handler
      limiter: new RateLimiterMemory({ points: 10, duration: 1 }),
    }),
    PipelineModule.forRoot({ behaviors: [RateLimitBehavior] }),
  ],
})
export class AppModule {}
```

Opt a handler in per-handler (or rely on the global registration above):

```typescript
@CommandHandler(CreateUserCommand)
@UsePipeline([
  RateLimitBehavior,
  { points: 1, keyFactory: (ctx) => `${ctx.requestName}:${ctx.request.ip}` },
])
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {}
```

---

## Backends

Swapping the backend is a **one-line** change — only the limiter passed to
`forRoot`/`forRootAsync` differs. Handlers are untouched.

### Memory (single instance / tests)

```typescript
import { RateLimiterMemory } from 'rate-limiter-flexible';

RateLimitModule.forRoot({
  limiter: new RateLimiterMemory({ points: 10, duration: 1 }),
});
```

### Redis / Valkey (shared across instances)

```typescript
import { RateLimiterRedis } from 'rate-limiter-flexible';

RateLimitModule.forRootAsync({
  inject: [REDIS_CLIENT],
  useFactory: (redis) =>
    new RateLimiterRedis({ storeClient: redis, points: 100, duration: 60 }),
});
```

### Mongo / Postgres / MySQL

```typescript
import { RateLimiterPostgres } from 'rate-limiter-flexible';

RateLimitModule.forRootAsync({
  inject: [PG_POOL],
  useFactory: (pool) =>
    new RateLimiterPostgres({ storeClient: pool, points: 100, duration: 60 }),
});
```

---

## Behavior

For each request, `RateLimitBehavior`:

1. Resolves effective options (module defaults ← per-handler options).
2. Builds the bucket key via [keying strategy](#keying-strategy) and stores it on
   `context.items['rate-limit.key']`.
3. Calls `limiter.consume(key, points)`.
   - **Allowed** → stores the result on `context.items['rate-limit.result']` and
     runs the handler.
   - **Limit hit** → throws [`RateLimitExceededError`](#http-429-filter).
   - **Store error** (e.g. Redis down) → [fail-open or fail-closed](#fail-open-vs-fail-closed).

---

## Configuration

Per-handler options via `@UsePipeline([RateLimitBehavior, options])`, merged over
module-wide `defaults` (handler wins):

| Option | Type | Default | Description |
|---|---|---|---|
| `points` | `number` | `1` | Cost of this request. |
| `keyFactory` | `(ctx) => string` | `ctx.requestName` | Builds the bucket key. |
| `keyPrefix` | `string` | — | Prepended as `"<prefix>:<key>"`. |
| `limiter` | `RateLimiterLike` | injected | Per-handler limiter override (stricter/looser policy). |
| `failOpen` | `boolean` | `true` | On a **store** error, allow (`true`) or reject (`false`). |

Module-wide defaults:

```typescript
RateLimitModule.forRoot({
  limiter,
  defaults: { keyPrefix: 'api', failOpen: false },
});
```

---

## Keying strategy

The **key** is the rate-limit bucket. The default (`ctx.requestName`) gives one
shared bucket per request type. For per-caller limits, combine the request with a
stable caller id:

```typescript
// Per IP
{ keyFactory: (ctx) => `${ctx.requestName}:${ctx.request.ip}` }

// Per authenticated user
{ keyFactory: (ctx) => `${ctx.requestName}:${ctx.request.sessionUser.id}` }

// Per tenant
{ keyFactory: (ctx) => `${ctx.requestName}:${ctx.request.tenantId}` }
```

---

## HTTP 429 filter

`RateLimitExceededFilter` maps `RateLimitExceededError` to HTTP
`429 Too Many Requests` and sets a `Retry-After` header (works with Express and
Fastify):

```typescript
// main.ts
import { RateLimitExceededFilter } from '@nestjs-pipeline/rate-limit';

app.useGlobalFilters(new RateLimitExceededFilter());
```

Response body:

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded for CreateUserCommand (key: ...); retry after 3s",
  "retryAfter": 3
}
```

`RateLimitExceededError` carries `key`, `requestName`, `msBeforeNext`,
`retryAfterSeconds`, `remainingPoints`, and `limit` for custom handling.

---

## Fail-open vs fail-closed

`consume()` **rejects with a result** on a normal limit hit, but **rejects with a
plain `Error`** when the backing store itself fails (e.g. Redis unreachable). The
`failOpen` option controls only the latter:

- `failOpen: true` (default) — log a warning and let the request through.
  Favors **availability**: a store outage won't take down your API.
- `failOpen: false` — propagate the error. Favors **strict protection**: no
  request bypasses the limiter, at the cost of failing when the store is down.

---

## API Reference

| Export | Type | Description |
|---|---|---|
| `RateLimitBehavior` | Class | Pipeline behavior — consumes points before the handler |
| `RateLimitModule` | Class | `forRoot(options)` / `forRootAsync(options)` |
| `RateLimitExceededError` | Class | Thrown when a bucket is exhausted |
| `RateLimitExceededFilter` | Class | Maps the error to HTTP 429 + `Retry-After` |
| `RateLimiterLike` | Interface | Structural limiter shape: `consume(key, points?)` |
| `RateLimiterResLike` | Interface | Structural `rate-limiter-flexible` result |
| `RateLimitBehaviorOptions` | Interface | `{ points?, keyFactory?, keyPrefix?, limiter?, failOpen? }` |
| `RateLimitModuleOptions` / `RateLimitModuleAsyncOptions` | Interface | Module registration options |
| `buildRateLimitKey` | Function | Resolves the bucket key from a context + options |
| `RATE_LIMITER` / `RATE_LIMIT_DEFAULT_OPTIONS` | Token | Injection tokens |
| `RATE_LIMIT_ITEM` / `RATE_LIMIT_KEY_ITEM` | Const | `context.items` keys set per request |

---

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](../../LICENSE) and [`COMMERCIAL_LICENSE.txt`](../../COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
