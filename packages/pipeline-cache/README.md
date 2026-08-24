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

Read-heavy queries often hit the same data repeatedly. `@nestjs-pipeline/cache` adds a transparent caching layer to your CQRS pipeline without coupling the caching logic to your business code. It is a thin, type-safe behavior over [cache-manager](https://github.com/jaredwray/cacheable) v7 + [Keyv](https://keyv.org/), so you get tiered caches, background refresh, and a consistent interface across every supported backend.

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
    PipelineModule.forRoot({ behaviors: [CacheBehavior] }),
  ],
})
export class AppModule {}
```

### 2. Attach the behavior

Attach it globally (as above, via `PipelineModule`) or per handler with `@UsePipeline`.

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
through untouched. Override this with the `kinds` option. `null` and `undefined`
results are never written to the cache.

### Cache keys

The default key is `` `${requestName}:${stableStringify(request)}` ``, where
`stableStringify` sorts object keys recursively so structurally equal payloads
always map to the same entry. Provide a `key` factory to customize it.

### Options resolution

Effective options for a handler are resolved as:

1. Module-wide defaults bound via `CacheModule.forRoot({ ttl, defaults })`.
2. Per-handler options from `@UsePipeline([CacheBehavior, { ... }])`,
   shallow-merged on top (handler keys win).

### Context items

The behavior records diagnostics on `context.items`:

| Item key | Type | Meaning |
| -------- | ---- | ------- |
| `cache.hit` | `boolean` | Whether the request was served from cache. |
| `cache.key` | `string` | The resolved cache key. |

Exported as `CACHE_HIT_ITEM` and `CACHE_KEY_ITEM`.

---

## Configuration

`CacheModuleOptions` (passed to `CacheModule.forRoot`):

| Field | Type | Description |
| ----- | ---- | ----------- |
| `cache` | `Cache` | Pre-built `cache-manager` instance (escape hatch). |
| `stores` | `Keyv[]` | Pre-built Keyv stores (tiered). |
| `store` | `CacheStoreConfig \| CacheStoreConfig[]` | Declarative store(s). |
| `ttl` | `number` | Default TTL (ms) for stores and handlers. |
| `refreshThreshold` | `number` | Background-refresh threshold (ms). |
| `nonBlocking` | `boolean` | Optimize multi-store reads/writes. |
| `defaults` | `CacheBehaviorOptions` | Default per-handler options. |

`CacheBehaviorOptions` (per handler and/or module `defaults`):

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `kinds` | `Array<'command' \| 'query' \| 'event' \| 'unknown'>` | `['query']` | Request kinds eligible for caching. |
| `ttl` | `number` | module `ttl` | TTL (ms) for entries written by this handler. |
| `key` | `(context) => string` | `requestName:stableStringify(request)` | Custom cache-key factory. |
| `condition` | `(context) => boolean` | _always_ | Gate whether a request is cached. |

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

`CacheBehavior` emits `debug` cache hit/miss lines and `CacheModule.forRoot` logs the initialized store type at startup through the logger bound to `LOGGING_BEHAVIOR_LOGGER` (the same token used by the core `LoggingBehavior`).
If none is bound, a standard NestJS `Logger` is used. No extra wiring needed.

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
