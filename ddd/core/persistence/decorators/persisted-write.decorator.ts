/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  AcknowledgePersisted,
  type PersistedAggregate,
} from './acknowledge-persisted.decorator';
import { Cache, type CacheOptions } from './Cache';
import {
  MapPersistenceErrors,
  type UniqueConstraintMapping,
} from './map-persistence-errors.decorator';

/**
 * Options for {@link PersistedWrite}. The aggregate is always the method's
 * first argument.
 */
export interface PersistedWriteOptions<TEntity> {
  /**
   * Write-through, eviction and barrier/CAS settings, as accepted by
   * `@Cache({...})`. Omit for a repository without a cache.
   */
  cache?: CacheOptions<TEntity>;

  /** Unique-constraint violations to translate into domain exceptions. */
  unique?: readonly UniqueConstraintMapping<TEntity>[];

  /**
   * Translator for errors that match no unique mapping, as accepted by
   * `@MapPersistenceErrors({ otherwise })`.
   */
  otherwise?: (error: unknown, entity: TEntity) => unknown;
}

/**
 * Applies the canonical persistence write lifecycle to a repository method
 * whose first argument is the aggregate being written.
 *
 * Equivalent to stacking, outermost to innermost:
 * `@Cache(options.cache)` → `@AcknowledgePersisted(...)` →
 * `@MapPersistenceErrors(...)`, each selecting the first argument.
 *
 * - A rejected write translates known constraint errors, leaves the persisted
 *   version baseline unchanged and performs no cache maintenance.
 * - A resolved write acknowledges the persisted version first, then runs
 *   best-effort cache maintenance.
 *
 * It provides no transaction or event-delivery guarantee beyond those
 * decorators: promise resolution must mean a durable autocommitted write.
 * Use the individual decorators for other signatures, for writes that must not
 * acknowledge (such as deletes), or for caller-owned ordering.
 *
 * @example
 * ```typescript
 * @PersistedWrite<User>({
 *   cache: {
 *     setKey: (user) => filterCacheKey(User.aggregateName, { id: user.id }),
 *     invalidateKeys: (user) => [
 *       filterCacheKey(User.aggregateName, { email: user.email }),
 *     ],
 *   },
 *   unique: [
 *     {
 *       constraint: 'users_email_unique',
 *       columns: 'users.email',
 *       error: (user) => new UniqueEmailException(user),
 *     },
 *   ],
 * })
 * async save(user: User): Promise<UserSnapshot> { ... }
 * ```
 */
export function PersistedWrite<TEntity extends PersistedAggregate>(
  options: PersistedWriteOptions<TEntity> = {},
) {
  const cache = options.cache ? Cache<TEntity>(options.cache) : undefined;
  const acknowledge = AcknowledgePersisted<[TEntity]>({
    entity: ([entity]) => entity,
  });
  const mapErrors = MapPersistenceErrors<[TEntity], TEntity>({
    entity: ([entity]) => entity,
    unique: options.unique ?? [],
    otherwise: options.otherwise,
  });

  return <TResult>(
    target: object,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<(entity: TEntity) => Promise<TResult>>,
  ): void => {
    mapErrors(target, key, descriptor);
    acknowledge(target, key, descriptor);
    cache?.(target, key, descriptor);
  };
}
