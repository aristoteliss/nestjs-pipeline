/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IQueryOptions } from '../application/query.options';
import { ICache } from './cache.interface';
import { IQueryRepository } from './query-repository.interface';

/**
 * Repository-wide snapshot policy applied by {@link FromCache} to methods that
 * do not declare their own `hydrateFn` / `serializeFn`.
 */
export interface QueryRepositoryHydration<TResult> {
  /**
   * Rehydrates a cached snapshot. Every cache hit of a method relying on this
   * default is rehydrated, as with `alwaysHydrate: true`.
   */
  hydrateFn: (cached: unknown) => TResult;

  /** Converts a result into the snapshot stored on a miss. */
  serializeFn?: (result: TResult) => unknown;
}

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
 * @example Declaring rehydration once for the whole repository
 * ```typescript
 * @Injectable()
 * export class GetRoleQueryRepository extends QueryRepository<GetRoleQuery, Role | null> {
 *   constructor(
 *     @Inject(CACHE_TOKEN) cache: ICache<RoleSnapshot>,
 *     @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
 *   ) {
 *     super(cache, { hydrateFn: (cached) => Role.fromJSON(cached as RoleSnapshot) });
 *   }
 *
 *   @FromCache<GetRoleQuery, Role | null>({
 *     keyFn: (query) => filterCacheKey(Role.aggregateName, { id: query.roleId }),
 *   })
 *   async find(query: GetRoleQuery): Promise<Role | null> { ... }
 * }
 * ```
 *
 * A method that declares `hydrateFn` (including `null`) or `serializeFn`
 * uses its own value instead of the repository default.
 */
export abstract class QueryRepository<TQuery = IQueryOptions, TResult = unknown>
  implements IQueryRepository<TQuery, TResult>
{
  constructor(
    protected readonly cache: ICache<unknown>,
    protected readonly hydration?: QueryRepositoryHydration<TResult>,
  ) {}

  abstract find(query: TQuery): Promise<TResult>;
}
