/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { TransientOperationError } from '../domain/exceptions/transient-operation.error';

const TRANSIENT_CODES = new Set([
  '40001', // PostgreSQL serialization failure
  '40P01', // PostgreSQL deadlock
  '55P03', // PostgreSQL lock not available
  '57P01', // PostgreSQL admin shutdown
  '57P02', // PostgreSQL crash shutdown
  '57P03', // PostgreSQL cannot connect now
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'ETIMEDOUT',
  'SQLITE_BUSY',
  'SQLITE_LOCKED',
]);

/**
 * Persistence-adapter classifier for driver/network failures that are reasonable
 * to retry. This function is infrastructure-only; application handlers consume
 * {@link TransientOperationError} instead of importing this classifier.
 *
 * An error is transient when its `code` is one of:
 * - a retryable PostgreSQL SQLSTATE: serialization failure `40001`, deadlock
 *   `40P01`, lock not available `55P03`, shutdown `57P01`–`57P03`, or any code
 *   in the connection-exception (`08`) or insufficient-resource (`53`) class;
 * - a Node network error: `ECONNREFUSED`, `ECONNRESET`, `EHOSTUNREACH`,
 *   `ENETUNREACH`, `EPIPE` or `ETIMEDOUT`;
 * - `SQLITE_BUSY` or `SQLITE_LOCKED`;
 *
 * or when its `name` is `TaskCancelledError` or `TimeoutError`. A wrapped error
 * is classified through its `cause` chain, which may be cyclic.
 */
export function isTransientPersistenceError(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as {
      code?: unknown;
      name?: unknown;
      cause?: unknown;
    };
    const code = typeof candidate.code === 'string' ? candidate.code : '';
    if (
      TRANSIENT_CODES.has(code) ||
      code.startsWith('08') || // PostgreSQL connection exception class
      code.startsWith('53') // PostgreSQL insufficient-resource class
    ) {
      return true;
    }

    if (
      candidate.name === 'TaskCancelledError' ||
      candidate.name === 'TimeoutError'
    ) {
      return true;
    }

    current = candidate.cause;
  }
  return false;
}

/**
 * Translates persistence-specific transient failures into the neutral application
 * retry signal. Non-transient failures are returned unchanged.
 *
 * This is the canonical `otherwise` translator for {@link MapPersistenceErrors}
 * and {@link PersistedWrite}. Because non-transient errors keep their identity,
 * domain errors a repository throws on purpose (`ConcurrencyConflictError`,
 * `EntityNotFoundException`) pass through without a re-throw guard.
 *
 * @param error - The failure raised by the persistence operation.
 * @param operation - What was being done, for the message, such as
 *   `` `deleting User ${user.id}` ``.
 * @returns A {@link TransientOperationError} whose `cause` is `error`, or
 *   `error` itself when it is not transient.
 *
 * @example
 * ```ts
 * @MapPersistenceErrors<[User], User>({
 *   entity: ([user]) => user,
 *   unique: [],
 *   otherwise: (error, user) =>
 *     mapPersistenceError(error, `deleting User ${user.id}`),
 * })
 * async save(user: User): Promise<null> { ... }
 *
 * // Outside the lifecycle decorators:
 * try {
 *   return await em.findOne(Auth, { refreshTokenHash: hash }, { refresh: true });
 * } catch (error) {
 *   throw mapPersistenceError(error, 'auth session lookup');
 * }
 * ```
 */
export function mapPersistenceError(
  error: unknown,
  operation: string,
): unknown {
  return isTransientPersistenceError(error)
    ? new TransientOperationError(
        `Transient persistence failure while ${operation}.`,
        { cause: error },
      )
    : error;
}
