/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IQueryOptions } from '../../application/query.options';
import { type CacheStateEntry, isVersionedCache } from '../cache.interface';
import type { ICacheLogger } from '../cache-logger';
import { isCacheMutationBarrier } from '../helpers/cache-barrier.helper';
import { consoleCacheLogger, safeWarn } from '../helpers/cache-logger.helper';
import { reportMissingCacheProperty } from '../helpers/cache-owner.helper';
import { toCacheSnapshot } from '../helpers/cache-snapshot.helper';
import { isCacheNewer } from '../helpers/cache-version.helper';
import type {
  QueryRepository,
  QueryRepositoryHydration,
} from '../query-repository.abstract';

export { isCacheNewer };

const defaultLogger = consoleCacheLogger('FromCacheDecorator');

const warnedUnversionedAdapters = new WeakSet<object>();

/**
 * Reports an unversioned adapter once per instance: a silent loss of caching is
 * harder to diagnose than the race the bypass avoids.
 */
function warnUnversionedAdapterOnce(cache: object, logger: ICacheLogger): void {
  if (warnedUnversionedAdapters.has(cache)) return;
  warnedUnversionedAdapters.add(cache);
  safeWarn(
    logger,
    `${cache.constructor?.name ?? 'Cache adapter'} implements only get/set/delete, ` +
      'so @FromCache read-through is disabled for repositories using it. ' +
      'Implement IVersionedCache (readState/invalidate/tryFill) to enable ' +
      'revision-fenced caching.',
  );
}

/**
 * Options for configuring read-through caching and rehydration via {@link FromCache}.
 */
export interface FromCacheOptions<TQuery = unknown, TResult = unknown> {
  /**
   * Function deriving the cache key from query options.
   * When it returns `null`, caching is skipped for that call.
   */
  keyFn?: ((query: TQuery) => string | null) | null;

  /**
   * Function to rehydrate a raw cached snapshot back into a domain entity.
   * When omitted, the repository's {@link QueryRepositoryHydration} applies;
   * `null` opts this method out of it.
   */
  hydrateFn?: ((cached: unknown) => TResult) | null;

  /**
   * Optional serializer function to convert a domain entity or complex result into
   * a pure, detached snapshot for storage in cache.
   * If omitted, the repository's {@link QueryRepositoryHydration} serializer
   * applies, and otherwise {@link toCacheSnapshot} extracts a snapshot via
   * `result.toJSON()` or deep JSON cloning. `null` skips the repository default.
   */
  serializeFn?: ((result: TResult) => unknown) | null;

  /**
   * Requires `hydrateFn` at decoration time. Every hit is rehydrated whenever a
   * hydrator applies, so this flag does not change the result.
   */
  alwaysHydrate?: boolean;

  /**
   * Optional time-to-live in milliseconds for cached entries.
   */
  ttl?: number;

  /**
   * Optional version comparator for stale-read prevention during concurrent cache population.
   * Defaults to {@link isCacheNewer}.
   */
  isNewer?: (cached: unknown, incoming: unknown) => boolean;

  /**
   * Receives read-through warnings (unversioned adapter, uncacheable result, missing
   * `cache` property). Defaults to `console.warn` with a `[FromCacheDecorator]`
   * prefix. See {@link ICacheLogger}.
   */
  logger?: ICacheLogger;
}

/**
 * True for values whose cached JSON form equals the value itself: primitives,
 * arrays and plain objects of such values. Class instances and `Date` are not.
 */
function isPlainData(
  value: unknown,
  ancestors = new WeakSet<object>(),
): boolean {
  if (value === null || typeof value !== 'object') {
    return typeof value !== 'function' && typeof value !== 'bigint';
  }
  const prototype = Object.getPrototypeOf(value);
  if (
    ancestors.has(value) ||
    (!Array.isArray(value) &&
      prototype !== Object.prototype &&
      prototype !== null)
  ) {
    return false;
  }
  ancestors.add(value);
  const plain = Object.values(value).every((item) =>
    isPlainData(item, ancestors),
  );
  ancestors.delete(value);
  return plain;
}

/**
 * Read-through cache decorator for a {@link QueryRepository} `find` method.
 *
 * Provides declarative read-through caching with revision-fenced coordination:
 * - **Key derivation**: Generates a cache key via `keyFn`. If `keyFn` returns `null`, caching is skipped.
 * - **Snapshot storage contract**: Stores strictly serializable snapshots in the cache, never live domain aggregates.
 * - **Consistent result shape**: When a method or repository `hydrateFn` applies, every hit is rehydrated, so hits
 *   and misses return the same type. Without a hydrator only plain-data results are cached; any other result
 *   (a class instance, or a result reshaped by `serializeFn`) is returned uncached and reported once.
 * - **Revision-fenced consistency**: When coordinated via {@link IVersionedCache}, cache fill attempts verify the
 *   observed revision token atomically (`tryFill`). A fill started before an observed invalidation cannot
 *   repopulate the key afterwards.
 * - **Bounded retry**: Contended fills inspect current cache state and boundedly retry authoritative reads before
 *   falling back to un-cached database results.
 */
export function FromCache<
  TQuery extends IQueryOptions = IQueryOptions,
  TResult = unknown,
>(
  keyFnOrOptions:
    | ((query: TQuery) => string | null)
    | FromCacheOptions<TQuery, TResult>,
  hydrateFnOrOptions?:
    | ((cached: unknown) => TResult)
    | FromCacheOptions<TQuery, TResult>,
  extraOptions?: FromCacheOptions<TQuery, TResult>,
): MethodDecorator {
  const positionalKey = typeof keyFnOrOptions === 'function';
  const positionalHydrator =
    positionalKey && typeof hydrateFnOrOptions === 'function';
  let resolvedOptions = positionalKey ? hydrateFnOrOptions : keyFnOrOptions;
  if (typeof resolvedOptions === 'function') resolvedOptions = extraOptions;
  const resolvedKeyFn = positionalKey ? keyFnOrOptions : keyFnOrOptions.keyFn;
  const resolvedHydrateFn = positionalHydrator
    ? hydrateFnOrOptions
    : (resolvedOptions?.hydrateFn ?? undefined);
  const declaresHydrateFn =
    positionalHydrator ||
    (resolvedOptions !== undefined && 'hydrateFn' in resolvedOptions);
  const declaresSerializeFn =
    resolvedOptions !== undefined && 'serializeFn' in resolvedOptions;

  if (resolvedOptions?.alwaysHydrate && !resolvedHydrateFn) {
    throw new TypeError('FromCache: alwaysHydrate requires a hydrateFn');
  }

  const logger = resolvedOptions?.logger ?? defaultLogger;
  const MAX_FILL_RETRIES = 2;
  let reportedUncacheable = false;

  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const original = descriptor.value as (query: TQuery) => Promise<TResult>;

    descriptor.value = async function (
      this: QueryRepository<TQuery, TResult>,
      query: TQuery,
    ): Promise<TResult> {
      if (!this.cache) {
        reportMissingCacheProperty(this, '@FromCache', resolvedOptions?.logger);
        return original.call(this, query);
      }
      if (query.refresh) return original.call(this, query);

      if (!resolvedKeyFn) throw new TypeError('FromCache requires a keyFn');
      const key = resolvedKeyFn(query);

      if (key === null) {
        return original.call(this, query);
      }

      // Method-level options win; otherwise the repository policy applies,
      // and a repository hydrator rehydrates every hit.
      const repositoryHydration = this.hydration;
      const hydrateFn = declaresHydrateFn
        ? resolvedHydrateFn
        : repositoryHydration?.hydrateFn;
      const serializeFn = declaresSerializeFn
        ? resolvedOptions?.serializeFn
        : repositoryHydration?.serializeFn;

      const hydrateCached = (cachedValue: unknown): TResult =>
        hydrateFn ? hydrateFn(cachedValue) : (cachedValue as TResult);

      // A revision-fenced key can still hold a barrier written by an
      // unversioned writer against the same store; it is a sentinel, never a
      // snapshot, so it counts as a miss rather than something to hydrate. The
      // same holds for `null`: this decorator never fills one, so a stored null
      // is a leftover from another writer, not a cached absence.
      const isUsableSnapshot = (state: CacheStateEntry<unknown>): boolean =>
        state.status === 'hit' &&
        state.value !== undefined &&
        state.value !== null &&
        !isCacheMutationBarrier(state.value);

      // 1. Versioned coordination path (capable adapters)
      if (isVersionedCache(this.cache)) {
        let observedState = await this.cache.readState(key);

        if (isUsableSnapshot(observedState)) {
          return hydrateCached(observedState.value);
        }

        for (let attempt = 0; ; attempt++) {
          const result = await original.call(this, query);

          if (result === null || result === undefined) {
            const postState = await this.cache.readState(key);
            if (isUsableSnapshot(postState)) {
              return hydrateCached(postState.value);
            }
            return result;
          }

          // A hit without a hydrator returns the cached data as is, so only a
          // result that already is that data may be cached.
          if (!hydrateFn && (serializeFn || !isPlainData(result))) {
            if (!reportedUncacheable) {
              reportedUncacheable = true;
              safeWarn(
                logger,
                `${this.constructor.name} caches a result that a hit could not reproduce without a hydrateFn; ` +
                  'the result is returned uncached. Configure a hydrateFn or return plain data.',
              );
            }
            return result;
          }

          const snapshot = toCacheSnapshot(result, serializeFn);

          const committed = await this.cache.tryFill(
            key,
            observedState.revision,
            snapshot as never,
            { ttl: resolvedOptions?.ttl },
          );

          if (committed) {
            return result;
          }

          const currentState = await this.cache.readState(key);
          if (isUsableSnapshot(currentState)) {
            const newerCheck = resolvedOptions?.isNewer ?? isCacheNewer;
            if (newerCheck(currentState.value, snapshot)) {
              return hydrateCached(currentState.value);
            }
          }

          if (attempt === MAX_FILL_RETRIES) return result;
          observedState = currentState;
        }
      }

      // 2. Unversioned adapter: with no revision to fence a fill against a
      // concurrent invalidation, the cache is bypassed for both reads and fills.
      warnUnversionedAdapterOnce(this.cache, logger);
      return original.call(this, query);
    };
  };
}
