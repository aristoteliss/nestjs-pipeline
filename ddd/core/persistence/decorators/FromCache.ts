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
 * - **Negative caching prevention**: Only non-nullish database results are saved into the cache, preventing
 *   stale negative results from hiding newly-created entities.
 * - **Rehydration**: If `query.hydrate` is enabled, cached JSON snapshots are rehydrated into rich domain
 *   entities using `hydrateFn`.
 * - **Fail-closed policy**: Cache errors on read/set propagate to maintain strong consistency guarantees
 *   at the repository boundary.
 *
 * @param keyFn - Builds the cache key from the query, or returns `null` to bypass the cache.
 * @param hydrateFn - Optional rehydration function transforming cached snapshot JSON into entity instances.
 *
 * @example Read-through caching with entity rehydration
 * ```typescript
 * @Injectable()
 * export class GetUserQueryRepository extends QueryRepository<GetUserQuery, User | null> {
 *   @FromCache<GetUserQuery, User>(
 *     (query) => filterCacheKey('user', { id: query.userId }),
 *     (cached) => User.fromJSON(cached as UserSnapshot),
 *   )
 *   async find(query: GetUserQuery): Promise<User | null> {
 *     const user = await this.store.em.findOne(User, { id: query.userId });
 *     return user;
 *   }
 * }
 * ```
 */
export interface FromCacheOptions<TQuery = unknown, TResult = unknown> {
  keyFn?: ((query: TQuery) => string | null) | null;
  hydrateFn?: ((cached: unknown) => TResult) | null;
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
  let resolvedKeyFn: FromCacheOptions<TQuery, TResult>['keyFn'];
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
          return query.hydrate && resolvedHydrateFn
            ? resolvedHydrateFn(cached)
            : cached;
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

        const setOptions = {
          ttl: resolvedOptions?.ttl,
          isNewer: newerCheck,
        };
        await this.cache.set(key, result, setOptions);
      }

      return result;
    };
  };
}
