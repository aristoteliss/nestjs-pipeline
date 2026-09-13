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

import { IQueryOptions } from '../../application/query.options';
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
 * Provides declarative read-through caching for query operations:
 * - **Key derivation**: Generates a cache key via `keyFn`. If `keyFn` returns `null`, caching is skipped.
 * - **Snapshot storage contract**: Stores strictly serializable snapshots in the cache, never live domain aggregates.
 *   On cache miss, automatically extracts a snapshot via `serializeFn` or `result.toJSON()`.
 * - **Deterministic rehydration**: When `alwaysHydrate: true` is configured, automatically rehydrates cached snapshots
 *   into domain entities via `hydrateFn`, ensuring the repository always returns `Promise<TEntity | null>`.
 *   If omitted, rehydrates conditionally when `query.hydrate` is truthy.
 * - **Strong consistency on concurrent writes**: If a concurrent mutation updates and caches a newer snapshot
 *   while the database fetch was in-flight, the decorator returns the newer cached snapshot (hydrated if requested)
 *   rather than returning stale database data or corrupting the cache.
 * - **Fail-closed policy**: Cache errors on read/set propagate to maintain strong consistency guarantees
 *   at the repository boundary.
 *
 * @example Usage with options object and alwaysHydrate (recommended)
 * ```typescript
 * @Injectable()
 * export class GetUserQueryRepository extends QueryRepository<GetUserQuery, User | null> {
 *   constructor(
 *     @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
 *     @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
 *   ) {
 *     super(cache);
 *   }
 *
 *   @FromCache<GetUserQuery, User | null>({
 *     keyFn: (query) => filterCacheKey('user', { id: query.userId }),
 *     hydrateFn: (cached) => User.fromJSON(cached as UserSnapshot),
 *     alwaysHydrate: true,
 *   })
 *   async find(query: GetUserQuery): Promise<User | null> {
 *     return this.store.em.findOne(User, { id: query.userId });
 *   }
 * }
 * ```
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

  const MAX_BARRIER_RETRIES = 2;

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

      let attempt = 0;
      while (attempt <= MAX_BARRIER_RETRIES) {
        // 1. Initial Cache Check
        const initial = await this.cache.get(key);
        let initialBarrierToken: string | undefined;

        if (initial !== null && initial !== undefined) {
          if (isCacheMutationBarrier(initial)) {
            // Barrier observed: bypass cached value and record token to verify if mutation occurs during DB read
            initialBarrierToken = initial.token;
          } else {
            // Normal snapshot cache hit
            return hydrateCached(initial);
          }
        }

        // 2. Authoritative DB Read
        const result = await original.call(this, query);

        // 3. Post-DB Cache Check (MANDATORY for all DB results, even null!)
        const current = await this.cache.get(key);

        // Case A: Post-DB cache has a normal snapshot
        if (
          current !== null &&
          current !== undefined &&
          !isCacheMutationBarrier(current)
        ) {
          // Concurrent create: DB was null, but creator committed and cached a normal snapshot
          if (result === null || result === undefined) {
            return hydrateCached(current);
          }

          // Both DB and cache have data: compare snapshots
          const snapshot = toCacheSnapshot(
            result,
            resolvedOptions?.serializeFn,
          );
          const newerCheck = resolvedOptions?.isNewer ?? isCacheNewer;

          if (newerCheck(current, snapshot)) {
            return hydrateCached(current);
          }

          // DB snapshot is newer or equal: CAS-safe set
          const setOptions = {
            ttl: resolvedOptions?.ttl,
            isNewer: newerCheck,
          };
          await this.cache.set(key, snapshot, setOptions);
          return result;
        }

        // Case B: Post-DB cache has a mutation barrier
        if (
          current !== null &&
          current !== undefined &&
          isCacheMutationBarrier(current)
        ) {
          if (
            initialBarrierToken !== undefined &&
            current.token === initialBarrierToken
          ) {
            // Same barrier observed before and after DB read.
            // No mutation occurred while DB was in flight; DB result is authoritative relative to this barrier.
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

          // Different barrier, or barrier appeared while DB query was in flight!
          // Stale result detected: do NOT cache result!
          if (attempt < MAX_BARRIER_RETRIES) {
            attempt++;
            continue; // Retry authoritative DB read
          }

          // Bounded retries exhausted: return authoritative DB result without caching
          return result;
        }

        // Case C: Post-DB cache is a MISS (null/undefined)
        if (result === null || result === undefined) {
          return result;
        }

        // DB returned non-null result and cache is miss: populate cache
        const snapshot = toCacheSnapshot(result, resolvedOptions?.serializeFn);
        const setOptions = {
          ttl: resolvedOptions?.ttl,
          isNewer: resolvedOptions?.isNewer ?? isCacheNewer,
        };
        await this.cache.set(key, snapshot, setOptions);
        return result;
      }

      return original.call(this, query);
    };
  };
}
