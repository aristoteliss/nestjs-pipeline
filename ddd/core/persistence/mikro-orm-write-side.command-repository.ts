/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { EntityManager, EntityName, FilterQuery } from '@mikro-orm/core';
import type { RootEntitySnapshot } from '../domain/interfaces/root-entity-snapshot.interface';
import type { RootEntity } from '../domain/models/root.entity';
import type { ICache } from './cache.interface';
import { CommandRepository } from './command-repository.abstract';
import { mapPersistenceError } from './is-transient-persistence-error';
import type { IWriteSideAggregateRepository } from './write-side-aggregate-repository.interface';

/**
 * Supplies the MikroORM `EntityManager` for the current repository operation.
 *
 * {@link MikroOrmWriteSideCommandRepository} reads `em` on every operation and
 * never keeps it, so a source may return a different manager each time: the
 * current tenant's in a multi-tenant application, or the current request's.
 * A getter over the application's own store satisfies it, and so does a plain
 * `{ em }` object in a single-database setup or a test.
 */
export interface IEntityManagerSource {
  readonly em: EntityManager;
}

/**
 * Reusable write-side repository base class for command repositories that mutate an existing aggregate.
 *
 * Provides authoritative aggregate hydration via {@link findById}:
 * - Bypasses read-side caches (`@FromCache`) to prevent stale reads on mutation paths.
 * - Forces MikroORM `{ refresh: true }` to avoid returning stale Unit-of-Work identity-map entities.
 * - Translates low-level driver failures through {@link mapPersistenceError} into application-neutral transient signals.
 *
 * Concrete repositories extend this class, inject dependencies into `super(...)`, and provide their
 * decorated `save()` method with persistence lifecycle decorators (`@Cache`, `@AcknowledgePersisted`, `@MapPersistenceErrors`).
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
 * export class UpdateUserCommandRepository extends MikroOrmWriteSideCommandRepository<
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
 *   @Cache<User, UserSnapshot>(...)
 *   @AcknowledgePersisted<[User]>({ entity: ([user]) => user })
 *   @MapPersistenceErrors<[User], User>({ entity: ([user]) => user, unique: [] })
 *   async save(user: User): Promise<UserSnapshot> {
 *     ...
 *   }
 * }
 * ```
 */
export abstract class MikroOrmWriteSideCommandRepository<
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
  async findById(id: string): Promise<TEntity | null> {
    try {
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
    } catch (error) {
      throw mapPersistenceError(error, `loading ${this.aggregateName} ${id}`);
    }
  }
}
