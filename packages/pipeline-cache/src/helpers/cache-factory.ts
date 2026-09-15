/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type Cache, createCache } from 'cache-manager';
import { Keyv, type KeyvStoreAdapter } from 'keyv';
import type {
  CacheModuleOptions,
  CacheStoreConfig,
  CacheStoreType,
} from '../interfaces/cache-options.interface';

type AdapterConstructor = new (...args: unknown[]) => KeyvStoreAdapter;

/** Maps declarative store types to their optional `@keyv/*` adapter package. */
const ADAPTER_PACKAGES: Record<Exclude<CacheStoreType, 'memory'>, string> = {
  redis: '@keyv/redis',
  memcache: '@keyv/memcache',
  sqlite: '@keyv/sqlite',
  postgres: '@keyv/postgres',
};

/** Whether a CommonJS load error means the requested adapter package itself is missing. */
function isRequestedModuleMissing(error: unknown, pkg: string): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  if (code === 'MODULE_NOT_FOUND') {
    return (
      error.message.includes(`Cannot find module '${pkg}'`) ||
      error.message.includes(`Cannot find module "${pkg}"`)
    );
  }
  return error.message.includes('bindings file');
}

/**
 * Lazily resolve an optional `@keyv/*` adapter. The adapters are declared as
 * optional peer dependencies, so they are only required when the matching store
 * type is actually requested.
 *
 * Only an actual missing adapter package is translated into the friendly install
 * message. Errors thrown while loading an installed adapter — including a
 * missing transitive dependency or adapter initialization error — are re-thrown
 * unchanged so production diagnostics retain the real root cause.
 */
function requireAdapter(pkg: string): AdapterConstructor {
  let mod: { default?: AdapterConstructor } | AdapterConstructor;
  try {
    mod = require(pkg) as { default?: AdapterConstructor } | AdapterConstructor;
  } catch (error) {
    if (!isRequestedModuleMissing(error, pkg)) throw error;

    const wrapped = new Error(
      `[pipeline-cache] The optional '${pkg}' package is required for this store type. Install it with: pnpm add ${pkg}`,
    );
    (wrapped as Error & { cause?: unknown }).cause = error;
    throw wrapped;
  }
  return (
    (mod as { default?: AdapterConstructor }).default ??
    (mod as AdapterConstructor)
  );
}

/** Construct the backing `Keyv` store adapter for a declarative config. */
function createAdapterStore(config: CacheStoreConfig): KeyvStoreAdapter {
  const { type, url, options } = config;
  const Adapter = requireAdapter(
    ADAPTER_PACKAGES[type as Exclude<CacheStoreType, 'memory'>],
  );

  if (type === 'postgres') {
    return new Adapter({ uri: url, ...options });
  }

  return new Adapter(url, options);
}

/**
 * Build a single package-owned `Keyv` instance from a declarative store
 * configuration. Package-owned stores enable `throwOnErrors` so
 * {@link CacheBehavior} can apply its own `failOpen` / fail-closed policy rather
 * than having Keyv silently consume backend failures first.
 */
export function buildKeyv(config: CacheStoreConfig): Keyv {
  if (config.type === 'memory') {
    return new Keyv({
      namespace: config.namespace,
      ttl: config.ttl,
      throwOnErrors: true,
    });
  }

  return new Keyv({
    store: createAdapterStore(config),
    namespace: config.namespace,
    ttl: config.ttl,
    throwOnErrors: true,
  });
}

/**
 * Resolve the {@link CacheModuleOptions} into a ready-to-use `cache-manager`
 * {@link Cache}. A pre-built `cache` wins, followed by pre-built `stores`,
 * followed by declarative `store` configuration, falling back to an in-memory
 * store when nothing is provided.
 *
 * Package-created stores use `throwOnErrors: true` so cache failures reach
 * `CacheBehavior` and its configured failure policy. Caller-owned `cache` and
 * `stores` are **not mutated**: if an application intentionally shares a Keyv
 * instance with another subsystem, this package must not change that object's
 * error semantics globally.
 *
 * @example Fully package-owned Redis cache
 * ```ts
 * CacheModule.forRoot({
 *   store: { type: 'redis', url: process.env.REDIS_URL! },
 *   defaults: { failOpen: true },
 * });
 * ```
 *
 * @example Caller-owned shared store — configuration remains caller-controlled
 * ```ts
 * const shared = new Keyv({ store: sharedRedis, throwOnErrors: false });
 * CacheModule.forRoot({ stores: [shared] });
 * // buildCache() will not mutate shared.throwOnErrors.
 * ```
 */
export function buildCache(options: CacheModuleOptions): Cache {
  if (options.cache) {
    // Respect ownership: never mutate a cache object supplied by the caller.
    return options.cache;
  }

  let stores: Keyv[];
  if (options.stores && options.stores.length > 0) {
    // These instances belong to the caller. Pass them through untouched.
    stores = options.stores;
  } else if (options.store) {
    const configs = Array.isArray(options.store)
      ? options.store
      : [options.store];
    stores = configs.map(buildKeyv);
  } else {
    stores = [new Keyv({ throwOnErrors: true })];
  }

  return createCache({
    stores,
    ttl: options.ttl,
    refreshThreshold: options.refreshThreshold,
    nonBlocking: options.nonBlocking,
  });
}
