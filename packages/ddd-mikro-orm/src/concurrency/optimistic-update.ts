/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type {
  EntityData,
  EntityManager,
  EntityName,
  FilterQuery,
} from '@mikro-orm/core';
import { assertAutocommit } from './assert-autocommit.js';
import { expectOneRow, type VersionedAggregate } from './conditioned-write.js';

/**
 * Executes a single, version-conditioned, autocommitted SQL `UPDATE` statement on an aggregate entity.
 *
 * This function handles low-level optimistic locking mechanics for update command repositories:
 * - **Autocommit Enforcement**: Rejects an externally active transaction via
 *   {@link assertAutocommit}, because multi-statement transactions require commit hooks
 *   rather than standalone method decorators to guarantee atomic acknowledgment.
 * - **Version-Conditioned Write**: Issues `em.nativeUpdate` with filter `{ id: entity.id, version: entity.getExpectedVersion() }`
 *   and updates fields including `{ version: entity.version }`.
 * - **Affected Row Verification**:
 *   - Exactly `1` row affected: Write succeeded; completes cleanly.
 *   - `0` rows affected: Performs a refreshed diagnostic read (`findOne` with `refresh: true`):
 *     - If the entity is absent, throws `EntityNotFoundException`.
 *     - If the entity is present, throws `ConcurrencyConflictError`.
 *   - More than `1` row affected: Throws an `Error` indicating primary-key uniqueness invariant violation.
 *
 * > [!NOTE]
 * > This helper does not perform caching, aggregate acknowledgment, or domain event publication.
 * > Those concerns are owned by `@Cache`, `@AcknowledgePersisted`, and `CommandBaseHandler` respectively.
 *
 * @param em The MikroORM {@link EntityManager} instance (must be in autocommit mode).
 * @param entityType The entity class or registered name (e.g. `User`, `Role`).
 * @param entity The aggregate instance providing `id`, `version`, and `getExpectedVersion()`.
 * @param data Field payload to update (the `version` field is automatically injected from `entity.version`).
 * @param entityName Friendly name of the entity for error diagnostics (e.g. `'User'`).
 *
 * @throws {Error} If called within an active transaction (`em.isInTransaction() === true`).
 * @throws {EntityNotFoundException} If 0 rows were updated and the entity cannot be found.
 * @throws {ConcurrencyConflictError} If 0 rows were updated and the entity version has diverged.
 * @throws {Error} If unexpected row count (> 1) was affected.
 *
 * @example Usage in an update command repository
 * ```typescript
 * @PersistedWrite<User>({ cache: { setKey: (user) => cacheKey(User.aggregateName, { id: user.id }) } })
 * async save(user: User): Promise<UserSnapshot> {
 *   const snapshot = user.toJSON();
 *   await optimisticUpdate(
 *     this.store.em,
 *     User,
 *     user,
 *     { username: snapshot.username, updatedAt: snapshot.updatedAt },
 *     'User',
 *   );
 *   return snapshot;
 * }
 * ```
 */
export async function optimisticUpdate<TEntity extends VersionedAggregate>(
  em: EntityManager,
  entityType: EntityName<TEntity>,
  entity: TEntity,
  data: EntityData<TEntity>,
  entityName: string,
): Promise<void> {
  assertAutocommit(em, 'optimisticUpdate');
  const row = { id: entity.id, expectedVersion: entity.getExpectedVersion() };
  const affected = await em.nativeUpdate(
    entityType,
    { id: row.id, version: row.expectedVersion } as FilterQuery<TEntity>,
    { ...data, version: entity.version } as EntityData<TEntity>,
  );
  await expectOneRow(affected, em, entityType, row, entityName, 'updated');
}
