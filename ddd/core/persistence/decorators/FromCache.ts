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
export function FromCache<
  TQuery extends IQueryOptions = IQueryOptions,
  TResult = unknown,
>(
  keyFn: (query: TQuery) => string | null,
  hydrateFn?: (cached: unknown) => TResult,
): MethodDecorator {
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

      const key = keyFn(query);

      if (key !== null) {
        const cached = await this.cache.get(key);
        if (cached !== null && cached !== undefined) {
          return query.hydrate && hydrateFn ? hydrateFn(cached) : cached;
        }
      }

      const result = await original.call(this, query);

      if (key !== null && result !== null && result !== undefined) {
        await this.cache.set(key, result);
      }

      return result;
    };
  };
}
