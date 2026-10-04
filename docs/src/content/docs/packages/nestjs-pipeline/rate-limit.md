---
title: "@nestjs-pipeline/rate-limit"
description: "Rate-limiting behavior for the NestJS pipeline — backend-agnostic, powered by rate-limiter-flexible (memory, Redis/Valkey, Mongo, SQL drop-ins)."
editUrl: false
---
[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/rate-limit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/rate-limit)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/rate-limit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/rate-limit)

Rate-limiting behavior for `@nestjs-pipeline/core` — consumes points from a bucket before a command, query, or event handler runs, and throws `RateLimitExceededError` (→ HTTP `429`) when the bucket is exhausted.

It limits a **command**, not an HTTP route: the same limit applies wherever the command is dispatched from — an HTTP controller, a queue worker, gRPC, a scheduled job — keyed by tenant, caller or any field of the command. See [When to use this, and when `@nestjs/throttler`](#when-to-use-this-and-when-nestjsthrottler).

Backend-agnostic: it depends only on a tiny `RateLimiterLike` interface, satisfied by every [`rate-limiter-flexible`](https://www.npmjs.com/package/rate-limiter-flexible) backend — **memory**, **Redis/Valkey**, **Mongo**, **Postgres**, **MySQL**. The interface is typed *structurally*, so this package adds **zero heavy dependencies**; you pass your own limiter. Don't hand-roll distributed rate limiting — `rate-limiter-flexible` gives you atomic counters and race-free windows.

---

## Table of Contents

- [When to use this, and when `@nestjs/throttler`](#when-to-use-this-and-when-nestjsthrottler)
- [Why rate-limiter-flexible](#why-rate-limiter-flexible)
- [Installation](#installation)
- [Setup](#setup)
- [Backends](#backends)
- [Behavior](#behavior)
- [Configuration](#configuration)
- [Keying strategy](#keying-strategy)
- [Cost per command](#cost-per-command)
- [HTTP 429 filter](#http-429-filter)
- [Fail-open vs fail-closed](#fail-open-vs-fail-closed)
- [Behavior Contract & Bootstrap Diagnostics](#behavior-contract--bootstrap-diagnostics)
- [API Reference](#api-reference)
- [License](#license)

---

## When to use this, and when `@nestjs/throttler`

`@nestjs/throttler` is an HTTP guard. It limits requests at the edge, by route and
client, before any command exists. Keep it for raw flood protection of your HTTP
API.

This behavior limits a **command or query at the command bus**. It sees what the
guard cannot: the command itself, and the tenant and principal on the pipeline
context. Use it for business quotas that must hold on every transport.

| | `@nestjs/throttler` | `@nestjs-pipeline/rate-limit` |
|---|---|---|
| Runs at | the HTTP layer (guard) | the command bus (pipeline behavior) |
| Covers | HTTP (and WebSocket/GraphQL with adapters) | every dispatch: HTTP, queue workers, gRPC, cron jobs, other handlers |
| Keys on | route and client (IP, custom tracker) | anything on the context: tenant, principal, command fields |
| Cost | one request, one hit | fixed or computed per command (`points`) |
| Typical use | "at most 100 requests per minute per IP" | "a tenant may import at most 10 000 rows per hour" |

They compose: throttler at the edge against floods, this behavior for per-command
quotas. A command that is limited here is limited no matter which entry point
dispatched it, so a queue worker cannot bypass a quota that an HTTP controller
respects:

```typescript
const perTenant = createPartitionedRateLimitKeyFactory(() => undefined, {
  onMissingPartition: 'request', // one bucket per tenant: <tenant>:<requestName>
});

@CommandHandler(ImportUsersCommand)
@UsePipeline(
  rateLimit({
    keyFactory: perTenant,
    points: (ctx) => (ctx.request as ImportUsersCommand).rows.length,
  }),
)
export class ImportUsersHandler { /* ... */ }

// HTTP
@Post('imports')
importUsers(@Body() body: ImportUsersDto) {
  return this.commandBus.execute(new ImportUsersCommand(body.rows));
}

// Queue worker: the same quota applies.
@Processor('imports')
export class ImportWorker extends WorkerHost {
  process(job: Job<ImportUsersDto>) {
    return this.commandBus.execute(new ImportUsersCommand(job.data.rows));
  }
}
```

`RateLimitExceededError` is transport-neutral: the bundled filter maps it to HTTP
429, and a worker can read `msBeforeNext` to delay a retry.

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
pnpm add @cqrs-ddd/pipeline-rate-limit @cqrs-ddd/nestjs @cqrs-ddd/pipeline @nestjs/cqrs rate-limiter-flexible
```

**Peer dependencies:**

```bash
pnpm add @nestjs/common @nestjs/core reflect-metadata
```

Requires Node.js 22.12 or later, `@nestjs/common` and `@nestjs/core` `^12.1.0`.

> `rate-limiter-flexible` is **not** a hard dependency of this package — you pass
> your own limiter instance, so only the backend you actually use is loaded. It is
> tested with `rate-limiter-flexible` 11, which throws when a limiter is created
> without a finite `points` or `duration`.

---

## Setup

In your reliability module, configure your rate limiter and provide `RateLimitBehavior` as a singleton provider:

```typescript
import { Module, Logger } from '@nestjs/common';
import { PipelineModule } from '@cqrs-ddd/nestjs';
import {
  RateLimitBehavior,
  type RateLimiterLike,
} from '@cqrs-ddd/pipeline-rate-limit';
import { RateLimiterMemory } from 'rate-limiter-flexible';

export const RATE_LIMITER = Symbol('RATE_LIMITER');

@Module({
  imports: [
    PipelineModule.forRoot(),
  ],
  providers: [
    {
      provide: RATE_LIMITER,
      useFactory: () =>
        new RateLimiterMemory({
          points: 10, // 10 points per second
          duration: 1,
        }),
    },
    {
      provide: RateLimitBehavior,
      inject: [RATE_LIMITER],
      useFactory: (limiter: RateLimiterLike) =>
        new RateLimitBehavior(
          limiter,
          undefined, // Default behavior options
          new Logger(RateLimitBehavior.name),
        ),
    },
  ],
})
export class ReliabilityModule {}
```

Opt a handler in per-handler via `@UsePipeline(rateLimit(...))`, or configure `RateLimitBehavior` under `globalBehaviors` in `PipelineModule.forRoot`:

```typescript
import { rateLimit } from '@nestjs-pipeline/rate-limit';

@CommandHandler(CreateUserCommand)
@UsePipeline(
  rateLimit({
    points: 1,
    keyFactory: (ctx) => `${ctx.requestName}:${(ctx.request as CreateUserCommand).clientIp}`,
  }),
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

1. Resolves effective options (module defaults ← per-handler options) and the
   request's [cost](#cost-per-command). A cost of `0` runs the handler without
   touching the limiter.
2. Builds the bucket key via [keying strategy](#keying-strategy) (with `keyPrefix`
   when set) and stores it under `RATE_LIMIT_KEY_ITEM_TOKEN`.
3. Calls `limiter.consume(key, points)`, on the handler's `limiter` when given,
   otherwise on the module's.
   - **Allowed** → stores the result under `RATE_LIMIT_ITEM_TOKEN` and runs the
     handler.
   - **Limit hit** → stores the rejected result under `RATE_LIMIT_ITEM_TOKEN` and
     throws [`RateLimitExceededError`](#http-429-filter).
   - **Store error** (e.g. Redis down) → [fail-open or fail-closed](#fail-open-vs-fail-closed).

A later behavior or the handler can read both values through the typed tokens:

```typescript
import { getPipelineItem, type IPipelineContext } from '@nestjs-pipeline/core';
import {
  RATE_LIMIT_ITEM_TOKEN,
  RATE_LIMIT_KEY_ITEM_TOKEN,
} from '@nestjs-pipeline/rate-limit';

function quotaHeaders(context: IPipelineContext) {
  const result = getPipelineItem(context, RATE_LIMIT_ITEM_TOKEN);
  return {
    key: getPipelineItem(context, RATE_LIMIT_KEY_ITEM_TOKEN),
    remaining: result?.remainingPoints,
    resetInMs: result?.msBeforeNext,
  };
}
```

---

## Configuration

Per-handler options via `rateLimit(options)` (or the raw tuple
`@UsePipeline([RateLimitBehavior, options])`), shallow-merged over module-wide
`defaults` (handler wins):

| Option | Type | Default | Description |
|---|---|---|---|
| `points` | `number \| (ctx) => number` | `1` | Cost of this request: a non-negative safe integer, or a function computing it. `0` charges nothing. See [Cost per command](#cost-per-command). |
| `keyFactory` | `(ctx) => string` | **required** | Builds the bucket key. No default: see [Keying strategy](#keying-strategy). |
| `keyPrefix` | `string` | — | Prepended as `"<prefix>:<key>"`; `:` and `\` inside the prefix are escaped, the key is not. |
| `limiter` | `RateLimiterLike` | injected | Per-handler limiter override (stricter/looser policy). |
| `failOpen` | `boolean` | `true` | On a **store** error, allow (`true`) or reject (`false`). |

Module-wide defaults, including a shared key factory that handlers inherit with
`rateLimit({ inheritModuleKey: true })`:

```typescript
RateLimitModule.forRoot({
  limiter,
  defaults: {
    keyPrefix: 'api',
    failOpen: false,
    keyFactory: createPartitionedRateLimitKeyFactory(
      (ctx) => ctx.items.get('userId') as string | undefined,
    ),
  },
});

@CommandHandler(UpdateProfileCommand)
@UsePipeline(rateLimit({ inheritModuleKey: true, points: 2 }))
export class UpdateProfileHandler { /* ... */ }
```

`forRootAsync` takes `useFactory`, `inject` and `imports` for the limiter, and a
static `defaults`. Both register the module globally.

---

## Keying strategy

The **key** is the rate-limit bucket. `keyFactory` is **required** — there is no
default. The obvious one, `ctx.requestName`, is a single bucket shared by every
caller in every tenant, so one abusive client locks out everybody. A limiter whose
default turns one abuser into a full outage is worse than no limiter, because it
looks like protection.

For per-caller limits, prefer the built-in factory. It builds
`<tenant>:<caller>:<requestName>`, trims the caller identifier, and escapes each
segment, so
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

| `PartitionedRateLimitKeyOptions` | Default | Effect |
|---|---|---|
| `includeTenant` | `true` | Adds `context.tenantId` as the first segment. |
| `requireTenant` | value of `includeTenant` | Throws `MissingRateLimitPartitionError` when the tenant is missing; `false` writes an absent segment instead. |
| `onMissingPartition` | `'throw'` | `'request'` falls back to `<tenant>:<requestName>` when the caller resolves to an empty value. |

`MissingRateLimitPartitionError` has a `dimension` of `'tenant'` or `'caller'`.

A deliberately global bucket is still supported; it just has to be written down:

```typescript
{ keyFactory: (ctx) => ctx.requestName }
```

---

## Cost per command

The examples below assume key factories such as:

```typescript
const perCaller = createPartitionedRateLimitKeyFactory(
  (ctx) => ctx.items.get('userId') as string | undefined,
);
const perTenant = createPartitionedRateLimitKeyFactory(() => undefined, {
  onMissingPartition: 'request', // one bucket per tenant: <tenant>:<requestName>
});
```

Each command decides what one execution costs. The limiter's capacity (`points`
and `duration` of the `rate-limiter-flexible` instance) is the budget; the
behavior's `points` option is the price:

```typescript
// Fixed: a login costs 5 points of the same budget a profile update spends 1 of.
rateLimit({ keyFactory: perCaller, points: 5 })

// Computed per request: one point per imported row.
rateLimit({
  keyFactory: perTenant,
  points: (ctx) => (ctx.request as ImportUsersCommand).rows.length,
})

// Free for some requests: 0 charges nothing (no key is built, the limiter is not called).
rateLimit({
  keyFactory: perCaller,
  points: (ctx) => ((ctx.request as SearchQuery).cached ? 0 : 1),
})
```

- The cost must be a non-negative safe integer. A fixed invalid value fails
  application bootstrap with a `PipelineConfigurationError`; a function returning
  an invalid value throws a `TypeError` before the limiter is called, so a wrong
  cost is never silently charged as `1`.
- A cost above the limiter's capacity can never pass, whatever the wait.
  `RateLimitExceededError` carries both `points` (asked) and `limit` (capacity), so
  that case is visible.
- To give one command its own budget instead of a share of the module's, pass a
  `limiter` for that handler.

---

## HTTP 429 filter

`RateLimitExceededFilter` maps `RateLimitExceededError` to HTTP
`429 Too Many Requests` and sets a `Retry-After` header. Nest injects its
`HttpAdapterHost`, and the filter replies through that adapter (Express and Fastify, also
for an error thrown in middleware):

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { RateLimitExceededFilter } from '@nestjs-pipeline/rate-limit';

@Module({
  providers: [{ provide: APP_FILTER, useClass: RateLimitExceededFilter }],
})
export class AppModule {}
```

In `main.ts`, pass the host:
`app.useGlobalFilters(new RateLimitExceededFilter(app.get(HttpAdapterHost)))`.

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
`retryAfterSeconds` (at least `1`), `remainingPoints`, `points` and `limit` for custom
handling. `limit` is the limiter's `points` property, `undefined` when the limiter
does not expose one. The filter uses `header()` (Fastify) or `setHeader()` (Express),
and `json()` or `send()`.

Outside HTTP, catch the error and reschedule, for example in a BullMQ worker:

```typescript
import { DelayedError, type Job } from 'bullmq';
import { RateLimitExceededError } from '@nestjs-pipeline/rate-limit';

async process(job: Job<ImportUsersDto>, token?: string) {
  try {
    return await this.commandBus.execute(new ImportUsersCommand(job.data.rows));
  } catch (error) {
    if (!(error instanceof RateLimitExceededError)) throw error;
    await job.moveToDelayed(Date.now() + error.msBeforeNext, token);
    throw new DelayedError();
  }
}
```

---

## Fail-open vs fail-closed

`consume()` **rejects with a result** on a normal limit hit, but **rejects with a
plain `Error`** when the backing store itself fails (e.g. Redis unreachable). The
`failOpen` option controls only the latter:

- `failOpen: true` (default) — log a warning and let the request through. The
  logger is the one bound to `LOGGING_BEHAVIOR_LOGGER` of `@nestjs-pipeline/core`,
  or a Nest `Logger` when none is bound.
  Favors **availability**: a store outage won't take down your API.
- `failOpen: false` — log an error and propagate the original error. Favors **strict protection**: no
  request bypasses the limiter, at the cost of failing when the store is down.

---

## Behavior Contract & Bootstrap Diagnostics

`RateLimitBehavior` implements `@nestjs-pipeline/core` behavior contract diagnostics:

### Validation Invariants

- **Callable key factory required**: Whenever `RateLimitBehavior` is declared on a handler or globally in `PipelineModule.forRoot({ globalBehaviors })`, a callable `keyFactory: (context) => string` (`typeof === 'function'`) must be supplied either via handler options (`rateLimit({ keyFactory })`) or module-wide defaults (`RateLimitModule.forRoot({ defaults: { keyFactory } })`).
- **Bootstrap enforcement**: Declaring `RateLimitBehavior` without a callable key factory (e.g. passing a string, non-callable, or omitting it when no module default exists) fails fast at application startup with `PipelineConfigurationError` in `strict` diagnostics mode (the default of `PipelineModule`); `'warn'` logs it instead.
- **Valid fixed cost**: a fixed `points` must be a non-negative safe integer, or `points` must be a function; anything else fails startup with `PipelineConfigurationError`. A computed cost is checked per request.
- **Module defaults resolution**: Application-wide defaults supplied to `RateLimitModule.forRoot({ defaults: { ... } })` are merged beneath handler options via `RateLimitBehavior.resolveEffectiveOptions` and evaluated during bootstrap diagnostics.

---

## API Reference

| Export | Type | Description |
|---|---|---|
| `RateLimitBehavior` | Class | Pipeline behavior — consumes points before the handler |
| `rateLimit` | Function | Type-safe intent builder returning `[RateLimitBehavior, options]` requiring a key or explicit inheritance |
| `RateLimitIntentOptions` | Type | Options for `rateLimit(...)` with required key intent |
| `RateLimitModule` | Class | `forRoot(options)` / `forRootAsync(options)` |
| `RateLimitExceededError` | Class | Thrown when a bucket is exhausted; carries `points` asked and `limit` |
| `RateLimitExceededFilter` | Class | Maps the error to HTTP 429 + `Retry-After` |
| `RateLimiterLike` | Interface | Structural limiter shape: `consume(key, points?)` |
| `RateLimiterResLike` | Interface | Structural `rate-limiter-flexible` result |
| `RateLimitBehaviorOptions` | Interface | `{ points?, keyFactory?, keyPrefix?, limiter?, failOpen? }` |
| `RateLimitCostFactory` | Type | `(ctx) => number`, a per-request cost for `points` |
| `RateLimitModuleOptions` / `RateLimitModuleAsyncOptions` | Interface | Module registration options |
| `RateLimitKeyFactory` | Type | `(ctx) => string`, the bucket key |
| `createPartitionedRateLimitKeyFactory` | Function | Tenant-aware, escaped `<tenant>:<caller>:<requestName>` key factory |
| `PartitionedRateLimitKeyOptions` | Interface | `{ includeTenant?, requireTenant?, onMissingPartition? }` |
| `RateLimitPartitionFactory` | Type | `(ctx) => string \| undefined`, the caller identifier |
| `MissingRateLimitPartitionError` / `RateLimitPartitionDimension` | Class / Type | Thrown when a required tenant or caller is missing |
| `buildRateLimitKey` | Function | Resolves the bucket key from a context + options; throws a `TypeError` without `keyFactory` |
| `RATE_LIMITER` / `RATE_LIMIT_DEFAULT_OPTIONS` | Token | Injection tokens |
| `RATE_LIMIT_ITEM` / `RATE_LIMIT_KEY_ITEM` | Symbol | `context.items` exported unique Symbol keys set per request |
| `RATE_LIMIT_ITEM_TOKEN` / `RATE_LIMIT_KEY_ITEM_TOKEN` | `PipelineItemToken` | Typed tokens over the same keys (`RateLimiterResLike` / `string`), for `getPipelineItem` |
| `buildRateLimitAttributes` | Function | The attribute `rate_limit.remaining_points`, for span attributes through `AttributesBehavior` of [`@nestjs-pipeline/opentelemetry`](/nestjs-pipeline/packages/nestjs-pipeline/opentelemetry/#attributes-from-other-behaviors), audit `metadata` or logs; `{}` when the behavior did not run or the store reported no points. The key is never included |


---

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
