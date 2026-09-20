# @nestjs-pipeline/cache

## Architectural role

This reusable package caches final application query results, including expensive
aggregations, read models combining repositories and external-service composition.
It complements repository snapshot/read-through caches; it is not replaced by
them just because a particular example currently uses repository caching. Choose
the layer that owns the result and define its dependencies, security scope and
freshness. Using both layers is optional, and invalidation is not automatically
shared. See the
[architecture skill](../../.agents/skills/nestjs-pipeline-architecture/SKILL.md)
for layer ownership, invalidation and security rules.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/cache.svg)](https://www.npmjs.com/package/@nestjs-pipeline/cache)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/cache.svg)](https://www.npmjs.com/package/@nestjs-pipeline/cache)

Caching behavior for `@nestjs-pipeline/core`, powered by [cache-manager](https://www.npmjs.com/package/cache-manager) v7 on top of [Keyv](https://keyv.org/). Transparently cache query results — declaratively, with zero changes to your handler code — and choose any backend: **memory** (default), **redis**, **memcache**, **sqlite**, or **postgres**.

---

## Table of Contents

- [Why](#why)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [1. Register the module](#1-register-the-module)
  - [2. Attach the behavior](#2-attach-the-behavior)
  - [3. Configure per handler](#3-configure-per-handler)
- [Choosing a Store](#choosing-a-store)
  - [Memory (default)](#memory-default)
  - [Redis](#redis)
  - [Memcache](#memcache)
  - [SQLite](#sqlite)
  - [Postgres](#postgres)
  - [Tiered (multi-layer) caches](#tiered-multi-layer-caches)
  - [Escape hatches](#escape-hatches)
- [How It Works](#how-it-works)
  - [What gets cached](#what-gets-cached)
  - [Cache keys](#cache-keys)
  - [Options resolution](#options-resolution)
  - [Context items](#context-items)
- [Configuration](#configuration)
- [Behavior Contract & Bootstrap Diagnostics](#behavior-contract--bootstrap-diagnostics)
- [Custom Logger](#custom-logger)
- [API Reference](#api-reference)
- [License](#license)

---

## Why

Read-heavy queries often hit the same data repeatedly. `@nestjs-pipeline/cache` adds a transparent caching layer to your CQRS pipeline without coupling the caching logic to your business code. It is a thin, type-safe behavior over [cache-manager](https://github.com/jaredwray/cacheable) v7 + [Keyv](https://keyv.org/), so you get tiered caches and a consistent interface across every supported backend.

---

## Installation

```bash
pnpm add @nestjs-pipeline/cache cache-manager keyv
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common reflect-metadata
```

**Optional store adapters** — install only the one(s) you use:

```bash
pnpm add @keyv/redis      # type: 'redis'
pnpm add @keyv/memcache   # type: 'memcache'
pnpm add @keyv/sqlite     # type: 'sqlite'
pnpm add @keyv/postgres   # type: 'postgres'
```

> The `memory` store needs no adapter — it ships with Keyv. The other backends are loaded lazily; you only need the matching `@keyv/*` package when you actually select that store type.

---

## Quick Start

### 1. Register the module

```ts
import { Module } from '@nestjs/common';
import { PipelineModule } from '@nestjs-pipeline/core';
import { CacheModule, CacheBehavior } from '@nestjs-pipeline/cache';

@Module({
  imports: [
    // In-memory cache with a 30s default TTL
    CacheModule.forRoot({ ttl: 30_000 }),
    // Make CacheBehavior available to @UsePipeline/globalBehaviors.
    PipelineModule.forRoot({ behaviors: [CacheBehavior] }),
  ],
})
export class AppModule {}
```

### 2. Attach the behavior

The `behaviors` option above registers `CacheBehavior` with Nest DI; it does not execute it globally. Attach it per handler with `@UsePipeline`, or put it in `globalBehaviors` if you want it to run for a global scope.

### 3. Configure per handler

This protected-query fragment assumes an outer context resolver supplies
`tenantId`, `currentUserId`, and `capabilityVersion` before caching runs.
The handler still performs entity and field authorization on cache misses.

```ts
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { cache, createPartitionedCacheKeyFactory } from '@nestjs-pipeline/cache';

@QueryHandler(GetUserQuery)
@UsePipeline(cache({
  ttl: 60_000,
  key: createPartitionedCacheKeyFactory({
    principal: (ctx) => ctx.items.get('currentUserId') as string | undefined,
    scope: (ctx) => {
      const scope = ctx.items.get('capabilityVersion');
      if (typeof scope !== 'string' || !scope.trim()) {
        throw new Error('Missing capability version');
      }
      return scope;
    },
  }),
}))
export class GetUserHandler implements IQueryHandler<GetUserQuery> {
  async execute(query: GetUserQuery) {
    // ...expensive read; result cached for 60s
  }
}
```

> Use `cache({ inheritModuleKey: true })` only when the module supplies the key factory.
> The raw tuple form `@UsePipeline([CacheBehavior, { ... }])` remains supported as an escape hatch.

---

## Choosing a Store

The backend is selected once, when registering the module. Per-handler options
(`ttl`, `key`, `condition`, `kinds`) are independent of the store you pick.

### Memory (default)

```ts
CacheModule.forRoot({ ttl: 30_000 });
// equivalent to:
CacheModule.forRoot({ store: { type: 'memory' }, ttl: 30_000 });
```

### Redis

```ts
CacheModule.forRoot({
  store: { type: 'redis', url: 'redis://localhost:6379' },
  ttl: 60_000,
});
```

### Memcache

```ts
CacheModule.forRoot({
  store: { type: 'memcache', url: 'localhost:11211' },
});
```

### SQLite

```ts
CacheModule.forRoot({
  store: { type: 'sqlite', url: 'sqlite://./cache.sqlite' },
});
```

### Postgres

```ts
CacheModule.forRoot({
  store: {
    type: 'postgres',
    url: 'postgresql://user:pass@localhost:5432/db',
    options: { table: 'cache' },
  },
});
```

### Tiered (multi-layer) caches

Provide an array of stores — they are checked in order (fastest first) and
writes fan out to every layer:

```ts
CacheModule.forRoot({
  store: [
    { type: 'memory', ttl: 5_000 }, // L1: in-process
    { type: 'redis', url: 'redis://localhost:6379' }, // L2: shared
  ],
});
```

### Escape hatches

For full control, pass a pre-built `cache-manager` instance or your own `Keyv`
stores:

```ts
import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import KeyvRedis from '@keyv/redis';

// Pre-built Keyv stores
CacheModule.forRoot({
  stores: [new Keyv({ store: new KeyvRedis('redis://localhost:6379') })],
});

// Fully pre-built cache
CacheModule.forRoot({ cache: createCache({ stores: [new Keyv()] }) });
```

| Option | Precedence | Description |
| ------ | ---------- | ----------- |
| `cache` | 1 (highest) | A ready-made `cache-manager` instance. |
| `stores` | 2 | Pre-built `Keyv[]` (tiered, highest priority first). |
| `store` | 3 | Declarative config — a single store or an array. |
| _(none)_ | 4 (fallback) | In-memory `Keyv`. |

---

## How It Works

### What gets cached

Only **query** requests are cached by default — commands and events always pass
through untouched. Override this with the `kinds` option. On a cache miss,
`null` and `undefined` results are not written. A hit returns the value from
that lookup directly. `CacheBehavior` does not use `cache-manager.wrap()` or
background refresh because a refresh callback would re-run every behavior and
side effect nested after the cache behavior.

### Store errors

Declaratively created stores use `throwOnErrors: true`. Pre-built `cache` and
`stores` remain caller-owned and are passed through without changing their error
settings. The behavior can handle only failures those implementations surface;
it cannot detect backend errors they swallow.

`CacheBehavior` owns a consistent failure policy independently of the injected
`cache-manager` or custom cache implementation. By default, `failOpen: true`:

- a thrown cache read is logged, recorded as `cache.hit = false`, and bypasses
  both the cache lookup and write for that execution;
- a thrown cache write is logged and the successful handler result is returned.

Set `failOpen: false` to log and propagate either store error. This strict mode
can turn a successful downstream handler execution into a rejected request when
the subsequent cache write fails, so it is best suited to cases where cache
availability is part of the operation's contract. Errors from the condition,
key factory, or downstream handler are always propagated unchanged.

### Cache keys

The helper emits `cache:v3:<tenant>:<principal>:<scope>:<requestName>:<sha256>`,
with escaped segments and the absent-segment encoding supplied by core
`joinKeySegments`. Treat the generated key as opaque. Changing from older
formats causes a cold cache; let old entries expire or remove their namespace.

`key` is **required**. There is deliberately no default.

The previous default embedded `context.correlationId`, which is unique per
request. That made the cache write an entry for every query and never read one
back — two extra round-trips and unbounded store growth for a zero percent hit
rate. It was not an authorization boundary either: a client can send its own
correlation ID, and nested executions deliberately inherit one.
rate. It was not an authorization boundary either: correlation metadata does not
establish principal or permission isolation, as correlation IDs may be supplied
or reused. Cache hits skip the handler, including entity/field checks. For protected
results, provide an explicit `key` covering tenant, principal type/ID, effective
permission scope and response dependencies; fail closed if required context is
missing. Configure invalidation/freshness for that result separately. A type-level
authorization behavior outside the cache does not reproduce every entity check.

Use `createPartitionedCacheKeyFactory`. It partitions every dimension that can
change an authorized response, escapes each segment so `a:b` + `c` cannot collide
with `a` + `b:c`, and fails closed with `MissingCachePartitionError` when a
required dimension is absent:

```typescript
import { createPartitionedCacheKeyFactory } from '@nestjs-pipeline/cache';

@UsePipeline([CacheBehavior, {
  key: createPartitionedCacheKeyFactory({
    principal: (ctx) => ctx.items.get('currentUserId') as string | undefined,
    // Include a role-set hash or capability version, otherwise a principal whose
    // permissions were revoked keeps reading the old response until it expires.
    scope: (ctx) => ctx.items.get('capabilityVersion') as string | undefined,
  }),
}])
export class GetUsersHandler {}
```

For genuinely public responses that are identical for every caller:

```typescript
createPartitionedCacheKeyFactory({
  principal: () => 'public',
  requirePrincipal: false,
  requireTenant: false,
});
```

The request payload is included as a SHA-256 digest, so secrets and search terms
stay out of Redis key listings. The digest is built with `stableStringify`, which
sorts object keys recursively so structurally equal payloads map to the same
entry. It accepts `null`, booleans, finite numbers, strings, arrays, record-like
objects, and valid dates (converted to ISO strings). Lossy native JSON cases such
as `Map`, `Set`, `RegExp`, `Error`, binary values, non-finite numbers,
`undefined`, bigint, functions, symbols, and cycles are rejected instead of
risking a collision.

Because a cache hit returns before the handler runs, it also skips whatever
entity-level authorization and field filtering the handler performs. That is why
tenant and principal are required by the helper by default. The `scope` resolver
is optional in the API; supply and validate a permission fingerprint whenever
authorization changes can change the response. Missing scope is not rejected by
the helper.

### Options resolution

Effective options for a handler are resolved as:

1. Module-wide defaults bound via `CacheModule.forRoot({ ttl, defaults })`.
2. Per-handler options from `@UsePipeline([CacheBehavior, { ... }])`,
   shallow-merged on top (handler keys win).

### Context items

The behavior records diagnostics on `context.items`:

| Item Token | Type | Meaning |
| ---------- | ---- | ------- |
| `CACHE_HIT_ITEM` | `boolean` | Whether the request was served from cache. |
| `CACHE_KEY_ITEM` | `string` | The resolved cache key. |

Exported as unique `Symbol` constants (`CACHE_HIT_ITEM` and `CACHE_KEY_ITEM`) to prevent key collisions in `context.items`.


---

## Configuration

`CacheModuleOptions` (passed to `CacheModule.forRoot`):

| Field | Type | Description |
| ----- | ---- | ----------- |
| `cache` | `Cache` | Pre-built `cache-manager` instance (escape hatch). |
| `stores` | `Keyv[]` | Pre-built Keyv stores (tiered). |
| `store` | `CacheStoreConfig \| CacheStoreConfig[]` | Declarative store(s). |
| `ttl` | `number` | Default TTL (ms) for stores and handlers. |
| `nonBlocking` | `boolean` | Optimize multi-store reads/writes. |
| `defaults` | `CacheBehaviorOptions` | Default per-handler options. |

`CacheBehaviorOptions` (per handler and/or module `defaults`):

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `kinds` | `Array<'command' \| 'query' \| 'event' \| 'unknown'>` | `['query']` | Request kinds eligible for caching. |
| `ttl` | `number` | module `ttl` | TTL (ms) for entries written by this handler. |
| `key` | `(context) => string` | Required | Explicit cache-key factory; use `createPartitionedCacheKeyFactory` for protected responses. |
| `condition` | `(context) => boolean` | _always_ | Gate whether a request is cached. |
| `failOpen` | `boolean` | `true` | Log and bypass thrown cache read/write errors; set `false` to propagate them. |

`CacheStoreConfig` (declarative store):

| Field | Type | Description |
| ----- | ---- | ----------- |
| `type` | `'memory' \| 'redis' \| 'memcache' \| 'sqlite' \| 'postgres'` | Backend to build. |
| `url` | `string` | Connection string / URI (ignored for `memory`). |
| `namespace` | `string` | Key prefix for this store. |
| `ttl` | `number` | Default TTL (ms) for this store. |
| `options` | `Record<string, unknown>` | Adapter-specific options passed through. |

---

## Behavior Contract & Bootstrap Diagnostics

`CacheBehavior` implements `@nestjs-pipeline/core` behavior contract diagnostics:

### Ordering Constraints

- **Execution order**: Cache lookup must execute **after** CASL authorization (`@nestjs-pipeline/casl:CaslBehavior`) for all active cache request kinds (`kinds: ['query']` by default). This guarantees unauthenticated or unauthorized callers never receive cached responses.
- **Dynamic evaluation**: The ordering rule evaluates dynamically per handler. For inactive request kinds (e.g. a command handler where cache defaults to queries only), ordering constraints are not enforced.

### Validation Invariants

- **Callable key factory**: Whenever caching is active for a handler's request kind, `key` must be a callable function (`typeof === 'function'`). Strings or non-callable values are rejected fast at bootstrap.
- **Module defaults**: Application-wide defaults supplied to `CacheModule.forRoot({ defaults: { ... } })` are resolved by `CacheBehavior.resolveEffectiveOptions` and evaluated alongside handler options during bootstrap.

---

## Custom Logger

`CacheBehavior` emits `debug` cache hit/miss lines and `warn`/`error` store-failure lines through the logger injected with `LOGGING_BEHAVIOR_LOGGER`, falling back to a standard NestJS `Logger` when that token is not bound. `CacheModule.forRoot` uses its own static NestJS `Logger` for the startup store-initialization message.

---

## API Reference

```ts
import {
  CacheModule,
  CacheBehavior,
  cache,
  CACHE_DEFAULT_OPTIONS,
  PIPELINE_CACHE,
  CACHE_HIT_ITEM,
  CACHE_KEY_ITEM,
  buildCache,
  buildKeyv,
  createPartitionedCacheKeyFactory,
  MissingCachePartitionError,
  stableStringify,
  type CacheModuleOptions,
  type CacheBehaviorOptions,
  type CacheIntentOptions,
  type CacheStoreConfig,
  type CacheStoreType,
  type CacheKeyFactory,
  type CacheCondition,
  type PartitionedCacheKeyOptions,
} from '@nestjs-pipeline/cache';
```

---

## License

Distributed under a dual license: **AGPLv3** (open source) or a **Commercial
License**. See [`LICENSE`](../../LICENSE) and
[`COMMERCIAL_LICENSE.txt`](../../COMMERCIAL_LICENSE.txt), or contact
aristotelis@ik.me.
