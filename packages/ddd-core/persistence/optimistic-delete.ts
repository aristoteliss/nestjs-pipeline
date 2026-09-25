/* Copyright (C) 2026-present Aristotelis — see repository license. */
import type { EntityManager, EntityName, FilterQuery } from '@mikro-orm/core';
import { ConcurrencyConflictError } from '../domain/exceptions/concurrency-conflict.error';
import { EntityNotFoundException } from '../domain/exceptions/entity-not-found.exception';
import { assertAutocommit } from './assert-autocommit';

/**
 * Executes a single version-conditioned, autocommitted `DELETE` on an aggregate.
 *
 * The delete counterpart of `optimisticUpdate`, with the same contract:
 *
 * - rejects an externally active transaction before touching the database
 *   ({@link assertAutocommit});
 * - deletes on `{ id, version: aggregate.getExpectedVersion() }`, so a row
 *   modified since the aggregate was loaded is not removed;
 * - one affected row is success;
 * - zero rows runs one refreshed diagnostic read: an absent row is
 *   {@link EntityNotFoundException}, a present row is
 *   {@link ConcurrencyConflictError};
 * - any other count is an invariant violation, since the filter includes a
 *   primary key.
 *
 * The caller passes `em` once and this helper uses exactly that instance for both
 * the delete and the diagnostic read, so the two cannot observe different
 * transactional state.
 *
 * Caching, aggregate acknowledgment and event publication stay with `@Cache`,
 * `@AcknowledgePersisted` and `CommandBaseHandler`. A delete resolves to `null`
 * in the repositories here: there is no new persisted snapshot to acknowledge.
 *
 * Unversioned rows (session or token tables without a `version` column) are out
 * of scope — do not invent a version field to reuse this helper; delete those by
 * primary key and document the different lifecycle.
 *
 * @param em Entity manager in autocommit mode.
 * @param entityType Entity class or registered name.
 * @param aggregate Aggregate providing `id` and `getExpectedVersion()`.
 * @param entityName Friendly name for diagnostics, e.g. `'User'`.
 *
 * @throws {Error} Inside an active transaction, or on an unexpected row count.
 * @throws {EntityNotFoundException} No row matched and the entity is gone.
 * @throws {ConcurrencyConflictError} No row matched because the version diverged.
 *
 * @example Delete command repository
 * ```typescript
 * @Cache<User, null>({ deleteKeys: (user) => [cacheKey(user)] })
 * @MapPersistenceErrors<[User], User>({ entity: ([user]) => user, unique: [] })
 * async save(user: User): Promise<null> {
 *   await optimisticDelete(this.store.em, User, user, 'User');
 *   return null;
 * }
 * ```
 */
export async function optimisticDelete<
  TEntity extends {
    readonly id: string;
    readonly version: number;
    getExpectedVersion(): number;
  },
>(
  em: EntityManager,
  entityType: EntityName<TEntity>,
  aggregate: TEntity,
  entityName: string,
): Promise<void> {
  assertAutocommit(em, 'optimisticDelete');

  const id = aggregate.id;
  const expectedVersion = aggregate.getExpectedVersion();

  const affected = await em.nativeDelete(entityType, {
    id,
    version: expectedVersion,
  } as FilterQuery<TEntity>);

  if (affected === 0) {
    const existing = await em.findOne(
      entityType,
      { id } as FilterQuery<TEntity>,
      { refresh: true },
    );
    if (!existing) throw new EntityNotFoundException(entityName, id);
    throw new ConcurrencyConflictError(
      entityName,
      id,
      expectedVersion,
      existing.version,
    );
  }

  if (affected !== 1) {
    throw new Error(
      `Expected one deleted ${entityName}, received ${affected}.`,
    );
  }
}
