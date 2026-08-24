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

/**
 * Lazily resolve an optional `@keyv/*` adapter. The adapters are declared as
 * optional peer dependencies, so they are only required when the matching store
 * type is actually requested.
 */
function requireAdapter(pkg: string): AdapterConstructor {
  let mod: { default?: AdapterConstructor } | AdapterConstructor;
  try {
    mod = require(pkg) as { default?: AdapterConstructor } | AdapterConstructor;
  } catch {
    throw new Error(
      `[pipeline-cache] The optional '${pkg}' package is required for this store type. Install it with: pnpm add ${pkg}`,
    );
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

/** Build a single `Keyv` instance from a declarative store configuration. */
export function buildKeyv(config: CacheStoreConfig): Keyv {
  if (config.type === 'memory') {
    return new Keyv({ namespace: config.namespace, ttl: config.ttl });
  }

  return new Keyv({
    store: createAdapterStore(config),
    namespace: config.namespace,
    ttl: config.ttl,
  });
}

/**
 * Resolve the {@link CacheModuleOptions} into a ready-to-use `cache-manager`
 * {@link Cache}. A pre-built `cache` wins, followed by pre-built `stores`,
 * followed by declarative `store` configuration, falling back to an in-memory
 * store when nothing is provided.
 */
export function buildCache(options: CacheModuleOptions): Cache {
  if (options.cache) {
    return options.cache;
  }

  let stores: Keyv[];
  if (options.stores && options.stores.length > 0) {
    stores = options.stores;
  } else if (options.store) {
    const configs = Array.isArray(options.store)
      ? options.store
      : [options.store];
    stores = configs.map(buildKeyv);
  } else {
    stores = [new Keyv()];
  }

  return createCache({
    stores,
    ttl: options.ttl,
    refreshThreshold: options.refreshThreshold,
    nonBlocking: options.nonBlocking,
  });
}
