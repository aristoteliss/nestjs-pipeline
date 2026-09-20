/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IQueryOptions } from '../../application/query.options';
import { type CacheStateEntry, isVersionedCache } from '../cache.interface';
import { isCacheMutationBarrier } from '../helpers/cache-barrier.helper';
import { toCacheSnapshot } from '../helpers/cache-snapshot.helper';
import { isCacheNewer } from '../helpers/cache-version.helper';
import { QueryRepository } from '../query-repository.abstract';

export { isCacheNewer };

/**
 * Options for configuring read-through caching and rehydration via {@link FromCache}.
 */
export interface FromCacheOptions<TQuery = unknown, TResult = unknown> {
  /**
   * Function deriving the cache key from query options.
   * If `null` or returns `null`, caching is skipped for the invocation.
   */
  keyFn?: ((query: TQuery) => string | null) | null;

  /**
   * Function to rehydrate a raw cached snapshot back into a domain entity.
   */
  hydrateFn?: ((cached: unknown) => TResult) | null;

  /**
   * Optional serializer function to convert a domain entity or complex result into
   * a pure, detached snapshot for storage in cache.
   * If omitted, {@link toCacheSnapshot} automatically extracts a snapshot via
   * `result.toJSON()` or deep JSON cloning.
   */
  serializeFn?: ((result: TResult) => unknown) | null;

  /**
   * If `true`, cached entries are always rehydrated via `hydrateFn` regardless of whether
   * `query.hydrate` is explicitly set. If `false` or omitted, hydration occurs only when `query.hydrate` is truthy.
   * Requires a valid `hydrateFn` to be configured at decoration time.
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
}

/**
 * Read-through cache decorator for a {@link QueryRepository} `find` method.
 *
 * Provides declarative read-through caching with revision-fenced coordination:
 * - **Key derivation**: Generates a cache key via `keyFn`. If `keyFn` returns `null`, caching is skipped.
 * - **Snapshot storage contract**: Stores strictly serializable snapshots in the cache, never live domain aggregates.
 * - **Deterministic rehydration**: When `alwaysHydrate: true` is configured, automatically rehydrates cached snapshots
 *   into domain entities via `hydrateFn`.
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
  let resolvedKeyFn: FromCacheOptions<TQuery, TResult>['keyFn'] | undefined;
  let resolvedHydrateFn: ((cached: unknown) => TResult) | undefined;
  let resolvedOptions: FromCacheOptions<TQuery, TResult> | undefined;

  if (typeof keyFnOrOptions === 'function') {
    resolvedKeyFn = keyFnOrOptions;
    if (typeof hydrateFnOrOptions === 'function') {
      resolvedHydrateFn = hydrateFnOrOptions;
      resolvedOptions = extraOptions;
    } else {
      resolvedOptions = hydrateFnOrOptions;
    }
  } else {
    resolvedKeyFn = keyFnOrOptions.keyFn;
    resolvedHydrateFn = keyFnOrOptions.hydrateFn ?? undefined;
    resolvedOptions = keyFnOrOptions;
  }

  if (resolvedOptions?.alwaysHydrate && !resolvedHydrateFn) {
    throw new TypeError('FromCache: alwaysHydrate requires a hydrateFn');
  }

  const MAX_FILL_RETRIES = 2;

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
      if (!this.cache || query.refresh) {
        return original.call(this, query);
      }

      if (!resolvedKeyFn) throw new TypeError('FromCache requires a keyFn');
      const key = resolvedKeyFn(query);

      if (key === null) {
        return original.call(this, query);
      }

      const hydrateCached = (cachedValue: unknown): TResult => {
        if (
          resolvedHydrateFn &&
          (resolvedOptions?.alwaysHydrate || query.hydrate)
        ) {
          return resolvedHydrateFn(cachedValue);
        }
        return cachedValue as unknown as TResult;
      };

      // A revision-fenced key can still hold a barrier written by an
      // unversioned writer against the same store; it is a sentinel, never a
      // snapshot, so it counts as a miss rather than something to hydrate.
      const isUsableSnapshot = (state: CacheStateEntry<unknown>): boolean =>
        state.status === 'hit' &&
        state.value !== undefined &&
        !isCacheMutationBarrier(state.value);

      // 1. Versioned coordination path (capable adapters)
      if (isVersionedCache(this.cache)) {
        let attempt = 0;
        let observedState = await this.cache.readState(key);

        if (isUsableSnapshot(observedState)) {
          return hydrateCached(observedState.value);
        }

        while (attempt <= MAX_FILL_RETRIES) {
          const result = await original.call(this, query);

          if (result === null || result === undefined) {
            const postState = await this.cache.readState(key);
            if (isUsableSnapshot(postState)) {
              return hydrateCached(postState.value);
            }
            return result;
          }

          const snapshot = toCacheSnapshot(
            result,
            resolvedOptions?.serializeFn,
          );

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

          if (attempt < MAX_FILL_RETRIES) {
            attempt++;
            observedState = currentState;
            continue;
          }

          return result;
        }

        return original.call(this, query);
      }

      // 2. Legacy fallback path (unversioned get/set adapters)
      let attempt = 0;
      while (attempt <= MAX_FILL_RETRIES) {
        const initial = await this.cache.get(key);
        let initialBarrierToken: string | undefined;

        if (initial !== null && initial !== undefined) {
          if (isCacheMutationBarrier(initial)) {
            initialBarrierToken = initial.token;
          } else {
            return hydrateCached(initial);
          }
        }

        const result = await original.call(this, query);
        const current = await this.cache.get(key);

        if (
          current !== null &&
          current !== undefined &&
          !isCacheMutationBarrier(current)
        ) {
          if (result === null || result === undefined) {
            return hydrateCached(current);
          }

          const snapshot = toCacheSnapshot(
            result,
            resolvedOptions?.serializeFn,
          );
          const newerCheck = resolvedOptions?.isNewer ?? isCacheNewer;

          if (newerCheck(current, snapshot)) {
            return hydrateCached(current);
          }

          await this.cache.set(key, snapshot, {
            ttl: resolvedOptions?.ttl,
            isNewer: newerCheck,
          });
          return result;
        }

        if (
          current !== null &&
          current !== undefined &&
          isCacheMutationBarrier(current)
        ) {
          if (
            initialBarrierToken !== undefined &&
            current.token === initialBarrierToken
          ) {
            if (result !== null && result !== undefined) {
              const snapshot = toCacheSnapshot(
                result,
                resolvedOptions?.serializeFn,
              );
              await this.cache.set(key, snapshot, {
                ttl: resolvedOptions?.ttl,
                isNewer: resolvedOptions?.isNewer ?? isCacheNewer,
              });
            }
            return result;
          }

          if (attempt < MAX_FILL_RETRIES) {
            attempt++;
            continue;
          }

          return result;
        }

        if (result === null || result === undefined) {
          return result;
        }

        const snapshot = toCacheSnapshot(result, resolvedOptions?.serializeFn);
        await this.cache.set(key, snapshot, {
          ttl: resolvedOptions?.ttl,
          isNewer: resolvedOptions?.isNewer ?? isCacheNewer,
        });
        return result;
      }

      return original.call(this, query);
    };
  };
}
