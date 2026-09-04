# @nestjs-pipeline/cache

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

```ts
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { CacheBehavior } from '@nestjs-pipeline/cache';

@QueryHandler(GetUserQuery)
@UsePipeline([CacheBehavior, { ttl: 60_000 }])
export class GetUserHandler implements IQueryHandler<GetUserQuery> {
  async execute(query: GetUserQuery) {
    // ...expensive read; result cached for 60s
  }
}
```

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

The default key is `` `${requestName}:${stableStringify(request)}` ``, where
`stableStringify` sorts object keys recursively so structurally equal payloads
always map to the same entry. It accepts `null`, booleans, finite numbers,
strings, arrays, record-like objects, and valid dates (converted to ISO strings).
Lossy native JSON cases such as `Map`, `Set`, `RegExp`, `Error`, binary values,
non-finite numbers, `undefined`, bigint, functions, symbols, and cycles are
rejected instead of risking a collision. Provide a `key` factory to customize
the supported domain when needed.

Cache hits return before the handler runs. If a handler performs entity-level
authorization or response-field filtering after loading data, the cache key
**must** include every security dimension that can change that result (for
example tenant ID, principal ID, roles, or a permission-version token). The
default key contains only the request type and payload; it is safe only for
results that are identical across principals and tenants.

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
| `refreshThreshold` | `number` | Deprecated compatibility option forwarded to `cache-manager`; `CacheBehavior` does not call `wrap()`, so it does not trigger background refresh. |
| `nonBlocking` | `boolean` | Optimize multi-store reads/writes. |
| `defaults` | `CacheBehaviorOptions` | Default per-handler options. |

`CacheBehaviorOptions` (per handler and/or module `defaults`):

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `kinds` | `Array<'command' \| 'query' \| 'event' \| 'unknown'>` | `['query']` | Request kinds eligible for caching. |
| `ttl` | `number` | module `ttl` | TTL (ms) for entries written by this handler. |
| `key` | `(context) => string` | `requestName:stableStringify(request)` | Custom cache-key factory. |
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

## Custom Logger

`CacheBehavior` emits `debug` cache hit/miss lines and `warn`/`error` store-failure lines through the logger injected with `LOGGING_BEHAVIOR_LOGGER`, falling back to a standard NestJS `Logger` when that token is not bound. `CacheModule.forRoot` uses its own static NestJS `Logger` for the startup store-initialization message.

---

## API Reference

```ts
import {
  CacheModule,
  CacheBehavior,
  CACHE_DEFAULT_OPTIONS,
  PIPELINE_CACHE,
  CACHE_HIT_ITEM,
  CACHE_KEY_ITEM,
  buildCache,
  buildKeyv,
  defaultCacheKey,
  stableStringify,
  type CacheModuleOptions,
  type CacheBehaviorOptions,
  type CacheStoreConfig,
  type CacheStoreType,
  type CacheKeyFactory,
  type CacheCondition,
} from '@nestjs-pipeline/cache';
```

---

## License

Distributed under a dual license: **AGPLv3** (open source) or a **Commercial
License**. See [`LICENSE`](../../LICENSE) and
[`COMMERCIAL_LICENSE.txt`](../../COMMERCIAL_LICENSE.txt), or contact
aristotelis@ik.me.
