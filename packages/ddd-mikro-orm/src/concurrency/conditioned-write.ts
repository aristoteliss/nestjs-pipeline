/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  ConcurrencyConflictError,
  EntityNotFoundException,
} from '@cqrs-ddd/core/domain';
import type { EntityManager, EntityName, FilterQuery } from '@mikro-orm/core';

/** An aggregate written with version checks, such as a `RootEntity`. */
export interface VersionedAggregate {
  readonly id: string;
  readonly version: number;
  getExpectedVersion(): number;
}

/** The row a version-conditioned write targets, captured before it runs. */
export interface ConditionedRow {
  readonly id: string;
  readonly expectedVersion: number;
}

/**
 * Checks the row count of a write filtered on `{ id, version }`: one row is
 * success; none is diagnosed with one refreshed read on the same manager as
 * a missing row or a version conflict; more breaks the primary key invariant.
 *
 * @throws {EntityNotFoundException} No row matched and the row is gone.
 * @throws {ConcurrencyConflictError} No row matched because the version diverged.
 * @throws {Error} More than one row was affected.
 */
export async function expectOneRow<TEntity extends VersionedAggregate>(
  affected: number,
  em: EntityManager,
  entityType: EntityName<TEntity>,
  { id, expectedVersion }: ConditionedRow,
  entityName: string,
  verb: 'updated' | 'deleted',
): Promise<void> {
  if (affected === 1) return;
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
  throw new Error(`Expected one ${verb} ${entityName}, received ${affected}.`);
}
