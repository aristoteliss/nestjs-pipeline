/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DomainException } from './domain.exception';

/**
 * Framework-neutral signal that a version-conditioned write lost a race.
 *
 * Persistence adapters translate their own concurrency failures into this error,
 * exactly as they translate transient driver faults into
 * {@link TransientOperationError}. Previously they threw MikroORM's
 * `OptimisticLockError` and the HTTP filter caught it by type, so an ORM class
 * travelled from the repository through the application layer to the
 * presentation boundary — and changing the ORM would have meant changing the
 * exception filter.
 *
 * Transport adapters map it to their own conflict representation; the users-api
 * returns HTTP 409.
 */
export class ConcurrencyConflictError extends DomainException {
  constructor(
    readonly entityName: string,
    readonly entityId: string,
    readonly expectedVersion: number,
    readonly actualVersion?: number,
  ) {
    super(
      `${entityName} ${entityId} was modified concurrently: expected version ${expectedVersion}` +
        (actualVersion === undefined ? '.' : `, found ${actualVersion}.`),
    );
  }
}
