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
- [Behavior Contract & Bootstrap Diagnostics](#behavior-contract--bootstrap-diagnostics)
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
    // Register the behavior provider so handlers/globalBehaviors can reference it.
    PipelineModule.forRoot({ behaviors: [RateLimitBehavior] }),
  ],
})
export class AppModule {}
```

The `behaviors` entry above registers `RateLimitBehavior` with Nest DI; it does
**not** make rate limiting execute globally. Opt a handler in per-handler, or put
`RateLimitBehavior` under `globalBehaviors` if you want it applied to a global
scope:

```typescript
import { rateLimit } from '@nestjs-pipeline/rate-limit';

@CommandHandler(CreateUserCommand)
@UsePipeline(
  rateLimit({ points: 1, keyFactory: (ctx) => `${ctx.requestName}:${ctx.request.clientIp}` }),
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {}
```

> Use `rateLimit({ inheritModuleKey: true })` only when the module supplies the key factory.
> The raw tuple form `@UsePipeline([RateLimitBehavior, { ... }])` remains supported as an escape hatch.

`IPipelineContext.request` is the CQRS command/query/event, not an Express or
Fastify request. If a transport value such as an IP address is part of the
policy, copy it into the command/query at the transport boundary (or place it in
`context.items` from an upstream behavior) before `RateLimitBehavior` runs.

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
| `points` | `number` | `1` | Positive safe-integer cost of this request. |
| `keyFactory` | `(ctx) => string` | **required** | Builds the bucket key. No default: see [Keying strategy](#keying-strategy). |
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

The **key** is the rate-limit bucket. `keyFactory` is **required** — there is no
default. The obvious one, `ctx.requestName`, is a single bucket shared by every
caller in every tenant, so one abusive client locks out everybody. A limiter whose
default turns one abuser into a full outage is worse than no limiter, because it
looks like protection.

For per-caller limits, prefer the built-in factory. It escapes each segment, so
tenant `a:b` with principal `c` cannot collide with tenant `a` and principal
`b:c`, and it fails closed when a required dimension is missing:

```typescript
import { createPartitionedRateLimitKeyFactory } from '@nestjs-pipeline/rate-limit';

// Per authenticated caller, tenant-aware. Throws MissingRateLimitPartitionError
// when either the tenant or the caller cannot be resolved.
{ keyFactory: createPartitionedRateLimitKeyFactory((ctx) => ctx.items.get('callerId') as string) }

// Single-tenant deployment — state it, rather than letting the tenant vanish.
{ keyFactory: createPartitionedRateLimitKeyFactory(readCallerId, { includeTenant: false }) }

// Anonymous traffic allowed: falls back to a bucket still scoped to the tenant.
{ keyFactory: createPartitionedRateLimitKeyFactory(readCallerId, { onMissingPartition: 'request' }) }
```

A deliberately global bucket is still supported; it just has to be written down:

```typescript
{ keyFactory: (ctx) => ctx.requestName }
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

## Behavior Contract & Bootstrap Diagnostics

`RateLimitBehavior` implements `@nestjs-pipeline/core` behavior contract diagnostics:

### Validation Invariants

- **Callable key factory required**: Whenever `RateLimitBehavior` is declared on a handler or globally in `PipelineModule.forRoot({ globalBehaviors })`, a callable `keyFactory: (context) => string` (`typeof === 'function'`) must be supplied either via handler options (`rateLimit({ keyFactory })`) or module-wide defaults (`RateLimitModule.forRoot({ defaults: { keyFactory } })`).
- **Bootstrap enforcement**: Declaring `RateLimitBehavior` without a callable key factory (e.g. passing a string, non-callable, or omitting it when no module default exists) fails fast at application startup with `PipelineConfigurationError` in `strict` diagnostics mode.
- **Module defaults resolution**: Application-wide defaults supplied to `RateLimitModule.forRoot({ defaults: { ... } })` are merged beneath handler options via `RateLimitBehavior.resolveEffectiveOptions` and evaluated during bootstrap diagnostics.

---

## API Reference

| Export | Type | Description |
|---|---|---|
| `RateLimitBehavior` | Class | Pipeline behavior — consumes points before the handler |
| `rateLimit` | Function | Type-safe intent builder returning `[RateLimitBehavior, options]` requiring a key or explicit inheritance |
| `RateLimitIntentOptions` | Type | Options for `rateLimit(...)` with required key intent |
| `RateLimitModule` | Class | `forRoot(options)` / `forRootAsync(options)` |
| `RateLimitExceededError` | Class | Thrown when a bucket is exhausted |
| `RateLimitExceededFilter` | Class | Maps the error to HTTP 429 + `Retry-After` |
| `RateLimiterLike` | Interface | Structural limiter shape: `consume(key, points?)` |
| `RateLimiterResLike` | Interface | Structural `rate-limiter-flexible` result |
| `RateLimitBehaviorOptions` | Interface | `{ points?, keyFactory?, keyPrefix?, limiter?, failOpen? }` |
| `RateLimitModuleOptions` / `RateLimitModuleAsyncOptions` | Interface | Module registration options |
| `buildRateLimitKey` | Function | Resolves the bucket key from a context + options |
| `RATE_LIMITER` / `RATE_LIMIT_DEFAULT_OPTIONS` | Token | Injection tokens |
| `RATE_LIMIT_ITEM` / `RATE_LIMIT_KEY_ITEM` | Symbol | `context.items` exported unique Symbol keys set per request |
| `RATE_LIMIT_ITEM_TOKEN` / `RATE_LIMIT_KEY_ITEM_TOKEN` | `PipelineItemToken` | Typed tokens over the same keys (`RateLimiterResLike` / `string`), for `getPipelineItem` |


---

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
