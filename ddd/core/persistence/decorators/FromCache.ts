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
 * Derives a cache key from the query via `keyFn`; on a hit it returns the cached
 * value (optionally re-hydrated with `hydrateFn` when `query.hydrate` is set), and
 * on a miss it runs the original method and stores the result. If the repository
 * has no cache, or `keyFn` returns `null`, the call passes straight through.
 *
 * @param keyFn - Builds the cache key from the query, or returns `null` to skip caching.
 * @param hydrateFn - Optional transform applied to cached values when `query.hydrate` is true.
 */
export function FromCache<TQuery extends IQueryOptions = IQueryOptions, TResult = unknown>(
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

      if (key) {
        const cached = await this.cache.get(key);
        if (cached) {
          return query.hydrate && hydrateFn ? hydrateFn(cached) : cached;
        }
      }

      const result = await original.call(this, query);

      if (key) {
        await this.cache.set(key, result);
      }

      return result;
    };
  };
}
