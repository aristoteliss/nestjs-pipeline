/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import type { Cache } from 'cache-manager';
import type { Keyv } from 'keyv';

/**
 * Built-in store backends supported through declarative configuration.
 *
 * - `memory`   — in-process `Keyv` map (default, no extra dependency).
 * - `redis`    — requires the optional `@keyv/redis` package.
 * - `memcache` — requires the optional `@keyv/memcache` package.
 * - `sqlite`   — requires the optional `@keyv/sqlite` package.
 * - `postgres` — requires the optional `@keyv/postgres` package.
 */
export type CacheStoreType =
  | 'memory'
  | 'redis'
  | 'memcache'
  | 'sqlite'
  | 'postgres';

/**
 * Declarative description of a single cache store backend. Use this when you
 * want the module to construct the `Keyv` adapter for you.
 */
export interface CacheStoreConfig {
  /** Which backend to build. */
  type: CacheStoreType;
  /**
   * Connection string / URI for the backend, e.g. `redis://localhost:6379`,
   * `postgresql://user:pass@localhost:5432/db`, `sqlite://./cache.sqlite`, or
   * `localhost:11211` for memcache. Ignored for `memory`.
   */
  url?: string;
  /** Key namespace/prefix applied to every entry in this store. */
  namespace?: string;
  /** Default time-to-live (milliseconds) for entries written to this store. */
  ttl?: number;
  /** Adapter-specific options passed through to the underlying `@keyv/*` package. */
  options?: Record<string, unknown>;
}

/** Factory that derives the cache key for a given pipeline request. */
export type CacheKeyFactory = (context: IPipelineContext) => string;

/** Predicate deciding whether a given request should participate in caching. */
export type CacheCondition = (context: IPipelineContext) => boolean;

/**
 * Per-handler caching options, supplied through `@UsePipeline([CacheBehavior, options])`
 * and/or as module-wide defaults via {@link CacheModuleOptions.defaults}.
 *
 * @example
 * ```ts
 * @UsePipeline([CacheBehavior, {
 *   key: createPartitionedCacheKeyFactory({
 *     principal: (ctx) => ctx.items.get('userId') as string | undefined,
 *   }),
 *   ttl: 60_000,
 * }])
 * export class GetUserHandler {}
 * ```
 */
export interface CacheBehaviorOptions {
  /**
   * Request kinds eligible for caching. Defaults to `['query']` so that
   * commands and events bypass the cache automatically.
   */
  kinds?: Array<IPipelineContext['requestKind']>;
  /** Time-to-live (milliseconds) for entries written by this handler. */
  ttl?: number;
  /**
   * Cache-key factory. **Required** when this behavior runs — there is no default.
   *
   * A cache hit returns without executing the handler, so the key must partition
   * every dimension that can change the authorized response: tenant, principal,
   * permission scope and request payload. Use `createPartitionedCacheKeyFactory`
   * rather than composing one by hand.
   */
  key?: CacheKeyFactory;
  /** Optional predicate gating whether a given request is cached. */
  condition?: CacheCondition;
  /**
   * When a cache read or write throws, bypass the cache and continue (`true`,
   * default) or propagate the store error (`false`). A failed read bypasses the
   * write for that execution. This option does not catch key, condition, or
   * downstream handler errors.
   */
  failOpen?: boolean;
}

/**
 * Options accepted by {@link CacheModule.forRoot}. The store can be provided in
 * three mutually exclusive ways (checked in order): a pre-built `cache`,
 * pre-built `stores`, or declarative `store` configuration. When none are
 * supplied an in-memory store is used.
 *
 * @example Redis-backed cache
 * ```ts
 * CacheModule.forRoot({
 *   store: { type: 'redis', url: process.env.REDIS_URL! },
 *   ttl: 30_000,
 *   defaults: { failOpen: true },
 * });
 * ```
 */
export interface CacheModuleOptions {
  /** Escape hatch: a fully constructed `cache-manager` instance. */
  cache?: Cache;
  /** Escape hatch: pre-built `Keyv` stores (tiered, highest priority first). */
  stores?: Keyv[];
  /** Declarative store configuration — a single store or a tiered list. */
  store?: CacheStoreConfig | CacheStoreConfig[];
  /** Default time-to-live (milliseconds) applied across stores and handlers. */
  ttl?: number;
  /** Forwarded to `cache-manager`; optimizes behavior across multiple stores. */
  nonBlocking?: boolean;
  /** Default per-handler behavior options merged into every pipeline. */
  defaults?: CacheBehaviorOptions;
}
