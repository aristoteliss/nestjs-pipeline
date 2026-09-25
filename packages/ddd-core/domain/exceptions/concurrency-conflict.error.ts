/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DomainException } from './domain.exception';

/**
 * Framework-neutral signal that a version-conditioned write lost a race.
 *
 * Persistence adapters translate their own concurrency failures into this error,
 * exactly as they translate transient driver faults into
 * {@link TransientOperationError}, so no ORM exception class reaches the
 * application layer or the presentation boundary.
 *
 * Transport adapters map it to their own conflict representation, such as
 * HTTP 409 through `domainErrorHttpStatus`.
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
