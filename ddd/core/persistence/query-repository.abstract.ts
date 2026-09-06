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

import { IQueryOptions } from '../application/query.options';
import { ICache } from './cache.interface';
import { IQueryRepository } from './query-repository.interface';

/**
 * Base class for read-side (query) repositories.
 *
 * Resolves a query via the abstract {@link find} method and receives an
 * {@link ICache} instance. Subclasses annotate `find()` with the `@FromCache` decorator
 * to serve cached results, bypass cache, or rehydrate snapshots into domain entities.
 *
 * @typeParam TQuery - The query/options type accepted by {@link find}.
 * @typeParam TResult - The result type returned by {@link find}.
 *
 * @example Creating a query repository with @FromCache
 * ```typescript
 * @Injectable()
 * export class GetUserQueryRepository extends QueryRepository<GetUserQuery, User | null> {
 *   constructor(
 *     @Inject(CACHE_TOKEN) protected readonly cache: ICache<User>,
 *     @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
 *   ) {
 *     super(cache);
 *   }
 *
 *   @FromCache<GetUserQuery, User>(
 *     (query) => filterCacheKey('user', { id: query.userId }),
 *     (cached) => User.fromJSON(cached as UserSnapshot),
 *   )
 *   async find(query: GetUserQuery): Promise<User | null> {
 *     return this.store.em.findOne(User, { id: query.userId });
 *   }
 * }
 * ```
 */
export abstract class QueryRepository<TQuery = IQueryOptions, TResult = unknown>
  implements IQueryRepository<TQuery, TResult>
{
  constructor(protected readonly cache: ICache<TResult>) {}

  abstract find(query: TQuery): Promise<TResult>;
}
