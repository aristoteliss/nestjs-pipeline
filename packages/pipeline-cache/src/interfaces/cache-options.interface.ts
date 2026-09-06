/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

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
   * Custom cache-key factory. Defaults to
   * `` `${requestName}:${stableStringify(request)}` ``.
   * Include tenant/principal/permission scope whenever the response depends on
   * handler-level authorization or field filtering, because hits skip the handler.
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
  /**
   * Forwarded to `cache-manager` for compatibility. `CacheBehavior` does not
   * call `wrap()`, so this does not trigger background refresh in a pipeline.
   *
   * @deprecated Background refresh can re-enter downstream pipeline behaviors.
   */
  refreshThreshold?: number;
  /** Forwarded to `cache-manager`; optimizes behavior across multiple stores. */
  nonBlocking?: boolean;
  /** Default per-handler behavior options merged into every pipeline. */
  defaults?: CacheBehaviorOptions;
}
