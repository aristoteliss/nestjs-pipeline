/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type {
  ICache,
  IWriteSideAggregateRepository,
} from '@cqrs-ddd/core/application';
import type { RootEntity, RootEntitySnapshot } from '@cqrs-ddd/core/domain';
import {
  CommandRepository,
  MapPersistenceErrors,
} from '@cqrs-ddd/core/persistence';
import type { EntityName, FilterQuery } from '@mikro-orm/core';
import { mapPersistenceError } from '../errors/transient-error.js';
import type { IEntityManagerSource } from '../interfaces/entity-manager-source.js';

/**
 * Base class for the command repositories that load and save an existing aggregate.
 *
 * Provides authoritative aggregate hydration via {@link findById}:
 * - Bypasses read-side caches (`@FromCache`) to prevent stale reads on mutation paths.
 * - Forces MikroORM `{ refresh: true }` to avoid returning stale Unit-of-Work identity-map entities.
 * - Translates low-level driver failures through {@link mapPersistenceError} into application-neutral transient signals.
 *
 * Concrete repositories extend this class, inject dependencies into `super(...)`, and provide their
 * decorated `save()` method, usually through `@PersistedWrite`.
 * The `store` is any {@link IEntityManagerSource}, typically the application's own
 * store; its `em` is also what `save()` passes to `optimisticUpdate` or `optimisticDelete`.
 *
 * @typeParam TSnapshot - Snapshot structure of the aggregate.
 * @typeParam TEntity - Domain aggregate class extending {@link RootEntity}.
 * @typeParam TResult - Persisted result type returned by `save()`.
 *
 * @example
 * ```typescript
 * // A NestJS provider; STORE is the application's IEntityManagerSource token.
 * @Injectable()
 * export class UpdateUserCommandRepository extends AggregateRepository<
 *   UserSnapshot,
 *   User,
 *   UserSnapshot
 * > {
 *   constructor(
 *     @Inject(CACHE_TOKEN) cache: ICache<UserSnapshot>,
 *     @Inject(STORE) store: IEntityManagerSource,
 *   ) {
 *     super(cache, store, User, User.aggregateName, User.fromJSON);
 *   }
 *
 *   @PersistedWrite<User>({
 *     unique: { email: (user) => new UniqueEmailException(user) },
 *   })
 *   async save(user: User): Promise<UserSnapshot> {
 *     ...
 *   }
 * }
 * ```
 */
export abstract class AggregateRepository<
    TSnapshot extends Partial<RootEntitySnapshot>,
    TEntity extends RootEntity<TSnapshot>,
    TResult = unknown,
  >
  extends CommandRepository<TEntity, TResult, TSnapshot>
  implements IWriteSideAggregateRepository<TEntity>
{
  constructor(
    cache: ICache<TSnapshot>,
    protected readonly store: IEntityManagerSource,
    protected readonly entityClass: EntityName<TEntity>,
    protected readonly aggregateName: string,
    protected readonly hydrateFn: (snapshot: TSnapshot) => TEntity,
  ) {
    super(cache);
  }

  /**
   * Loads the authoritative aggregate directly from persistence.
   *
   * Enforces `{ refresh: true }` so that if the entity was already loaded in the active
   * EntityManager's identity map, its columns are re-fetched from the database before
   * domain mutations and optimistic concurrency checks take place. The manager comes
   * from `store.em`, read for this call.
   *
   * @param id - The aggregate identifier.
   * @returns Rehydrated aggregate instance, or `null` if not found.
   * @throws {TransientOperationError} If a retryable database connection or driver error occurs.
   */
  @MapPersistenceErrors<
    [string],
    string,
    never,
    AggregateRepository<RootEntitySnapshot, RootEntity, unknown>
  >({
    entity: ([id]) => id,
    otherwise(error, id) {
      return mapPersistenceError(error, `loading ${this.aggregateName} ${id}`);
    },
  })
  async findById(id: string): Promise<TEntity | null> {
    const entity = await this.store.em.findOne(
      this.entityClass,
      { id } as FilterQuery<TEntity>,
      { refresh: true },
    );

    if (!entity) {
      return null;
    }

    const snapshot = entity.toJSON() as TSnapshot;
    return this.hydrateFn(snapshot);
  }
}
