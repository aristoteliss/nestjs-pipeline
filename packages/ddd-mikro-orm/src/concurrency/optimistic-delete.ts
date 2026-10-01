/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { EntityManager, EntityName, FilterQuery } from '@mikro-orm/core';
import { assertAutocommit } from './assert-autocommit.js';
import { expectOneRow, type VersionedAggregate } from './conditioned-write.js';

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
 *   `EntityNotFoundException`, a present row is
 *   `ConcurrencyConflictError`;
 * - any other count is an invariant violation, since the filter includes a
 *   primary key.
 *
 * The caller passes `em` once and this helper uses exactly that instance for both
 * the delete and the diagnostic read, so the two cannot observe different
 * transactional state.
 *
 * Caching, aggregate acknowledgment and event publication stay with `@Cache`,
 * `@AcknowledgePersisted` and `CommandBaseHandler`. A delete repository resolves
 * to `null`: there is no new persisted snapshot to acknowledge.
 *
 * Rows without a version column are out of scope; delete them by primary key.
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
 * @Cache<User, null>({ deleteKeys: (user) => [cacheKey(User.aggregateName, { id: user.id })] })
 * @MapPersistenceErrors<[User], User>({
 *   entity: ([user]) => user,
 *   otherwise: (error, user) => mapPersistenceError(error, `deleting User ${user.id}`),
 * })
 * async save(user: User): Promise<null> {
 *   await optimisticDelete(this.store.em, User, user, 'User');
 *   return null;
 * }
 * ```
 */
export async function optimisticDelete<TEntity extends VersionedAggregate>(
  em: EntityManager,
  entityType: EntityName<TEntity>,
  aggregate: TEntity,
  entityName: string,
): Promise<void> {
  assertAutocommit(em, 'optimisticDelete');
  const row = {
    id: aggregate.id,
    expectedVersion: aggregate.getExpectedVersion(),
  };
  const affected = await em.nativeDelete(entityType, {
    id: row.id,
    version: row.expectedVersion,
  } as FilterQuery<TEntity>);
  await expectOneRow(affected, em, entityType, row, entityName, 'deleted');
}
