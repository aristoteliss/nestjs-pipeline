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
import { QueryRepository } from '../query-repository.abstract';

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
 * - **Negative caching prevention**: Only non-nullish database results are saved into the cache, preventing
 *   stale negative results from hiding newly-created entities.
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
 *
 * @example Legacy positional argument signature
 * ```typescript
 * @FromCache<GetUserQuery, User | null>(
 *   (query) => filterCacheKey('user', { id: query.userId }),
 *   (cached) => User.fromJSON(cached as UserSnapshot),
 * )
 * ```
 */
export interface FromCacheOptions<TQuery = unknown, TResult = unknown> {
  keyFn?: ((query: TQuery) => string | null) | null;
  hydrateFn?: ((cached: unknown) => TResult) | null;
  /**
   * Optional serializer function to convert a domain entity or complex result into
   * a pure, detached snapshot for storage in cache.
   * If omitted and the result has a `toJSON()` method, `result.toJSON()` is used automatically.
   */
  serializeFn?: ((result: TResult) => unknown) | null;
  /**
   * If `true`, cached entries are always rehydrated via `hydrateFn` regardless of whether
   * `query.hydrate` is explicitly set. If `false` or omitted, hydration occurs only when `query.hydrate` is truthy.
   */
  alwaysHydrate?: boolean;
  ttl?: number;
  isNewer?: (cached: unknown, incoming: unknown) => boolean;
}

/**
 * Checks whether a cached entry is strictly newer than an incoming database result
 * based on explicit version properties, generation counters, or updatedAt timestamps.
 */
export function isCacheNewer(cached: unknown, incoming: unknown): boolean {
  if (
    !cached ||
    typeof cached !== 'object' ||
    !incoming ||
    typeof incoming !== 'object'
  ) {
    return false;
  }
  const c = cached as Record<string, unknown>;
  const inc = incoming as Record<string, unknown>;

  if (typeof c.version === 'number' && typeof inc.version === 'number') {
    return c.version > inc.version;
  }

  if (typeof c.__gen === 'number' && typeof inc.__gen === 'number') {
    return c.__gen > inc.__gen;
  }

  if (c.updatedAt !== undefined && inc.updatedAt !== undefined) {
    const cTime =
      c.updatedAt instanceof Date
        ? c.updatedAt.getTime()
        : new Date(c.updatedAt as string | number).getTime();
    const incTime =
      inc.updatedAt instanceof Date
        ? inc.updatedAt.getTime()
        : new Date(inc.updatedAt as string | number).getTime();
    if (!Number.isNaN(cTime) && !Number.isNaN(incTime)) {
      return cTime > incTime;
    }
  }

  return false;
}

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

      if (key !== null) {
        const cached = await this.cache.get(key);
        if (cached !== null && cached !== undefined) {
          if (
            resolvedHydrateFn &&
            (resolvedOptions?.alwaysHydrate || query.hydrate)
          ) {
            return resolvedHydrateFn(cached);
          }
          return cached as unknown as TResult;
        }
      }

      const result = await original.call(this, query);

      if (key !== null && result !== null && result !== undefined) {
        const current = await this.cache.get(key);
        const newerCheck = resolvedOptions?.isNewer ?? isCacheNewer;
        if (
          current !== null &&
          current !== undefined &&
          newerCheck(current, result)
        ) {
          return result;
        }

        const snapshot = resolvedOptions?.serializeFn
          ? resolvedOptions.serializeFn(result)
          : typeof (result as { toJSON?: unknown })?.toJSON === 'function'
            ? (result as unknown as { toJSON: () => unknown }).toJSON()
            : result;

        const setOptions = {
          ttl: resolvedOptions?.ttl,
          isNewer: newerCheck,
        };
        await this.cache.set(key, snapshot, setOptions);
      }

      return result;
    };
  };
}
