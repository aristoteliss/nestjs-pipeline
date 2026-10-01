/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPersistenceDialect } from '../persistence-dialect.js';
import {
  AcknowledgePersisted,
  type PersistedAggregate,
} from './acknowledge-persisted.decorator.js';
import { Cache, type CacheOptions } from './cache.decorator.js';
import {
  MapPersistenceErrors,
  type UniqueErrors,
} from './map-persistence-errors.decorator.js';

/**
 * Options for {@link PersistedWrite}. The aggregate is always the method's
 * first argument.
 */
export interface PersistedWriteOptions<
  TEntity,
  TConstraint extends string = never,
> {
  /**
   * Write-through, eviction and barrier/CAS settings, as accepted by
   * `@Cache({...})`. Omit for a repository without a cache.
   */
  cache?: CacheOptions<TEntity>;

  /**
   * Domain errors per violated unique constraint, keyed by entity property, as
   * accepted by `@MapPersistenceErrors({ unique })`.
   */
  unique?: UniqueErrors<TEntity, TConstraint>;

  /** Dialect overriding the registered one, for a repository on another store. */
  dialect?: IPersistenceDialect;

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
 *     setKey: (user) => cacheKey(User.aggregateName, { id: user.id }),
 *     invalidateKeys: (user) => [
 *       cacheKey(User.aggregateName, { email: user.email }),
 *     ],
 *   },
 *   unique: { email: (user) => new UniqueEmailException(user) },
 * })
 * async save(user: User): Promise<UserSnapshot> { ... }
 * ```
 */
export function PersistedWrite<
  TEntity extends PersistedAggregate,
  TConstraint extends string = never,
>(options: PersistedWriteOptions<TEntity, TConstraint> = {}) {
  const cache = options.cache ? Cache<TEntity>(options.cache) : undefined;
  const acknowledge = AcknowledgePersisted<[TEntity]>({
    entity: ([entity]) => entity,
  });
  const mapErrors = MapPersistenceErrors<[TEntity], TEntity, TConstraint>({
    entity: ([entity]) => entity,
    unique: options.unique,
    dialect: options.dialect,
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
