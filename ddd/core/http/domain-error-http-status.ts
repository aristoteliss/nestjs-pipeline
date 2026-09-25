/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ConcurrencyConflictError } from '../domain/exceptions/concurrency-conflict.error';
import { DomainException } from '../domain/exceptions/domain.exception';
import { EntityNotFoundException } from '../domain/exceptions/entity-not-found.exception';
import { MissingTenantContextError } from '../domain/exceptions/missing-tenant-context.exception';

/** HTTP answer for a {@link DomainException}, as plain values. */
export interface DomainErrorHttpStatus {
  /** HTTP status code. */
  readonly statusCode: number;
  /** Reason phrase of `statusCode`, such as `'Conflict'`. */
  readonly error: string;
  /**
   * Message safe to return to the caller: the exception's own message, or a
   * generic one when the exception message is meant for developers.
   */
  readonly message: string;
}

/**
 * Maps this package's errors to an HTTP status, for any HTTP framework.
 *
 * | Exception | Status | Message |
 * |---|---|---|
 * | {@link ConcurrencyConflictError} | 409 Conflict | the exception's |
 * | {@link EntityNotFoundException} | 404 Not Found | the exception's |
 * | {@link MissingTenantContextError} | 500 Internal Server Error | `'Internal server error'` |
 * | any other {@link DomainException} | 400 Bad Request | the exception's |
 *
 * A missing tenant is a server misconfiguration, not a caller mistake, so it
 * answers 500 and keeps its message, which names the failed operation, out of
 * the response.
 *
 * An application maps its own `DomainException` subclasses first and passes the
 * rest here. Anything that is not a `DomainException` returns `undefined`, so
 * the framework's default handling still applies.
 *
 * @example An Express error handler
 * ```ts
 * app.use((err, req, res, next) => {
 *   const mapped = domainErrorHttpStatus(err);
 *   if (!mapped) return next(err);
 *   res.status(mapped.statusCode).json(mapped);
 * });
 * ```
 */
export function domainErrorHttpStatus(
  error: DomainException,
): DomainErrorHttpStatus;
export function domainErrorHttpStatus(
  error: unknown,
): DomainErrorHttpStatus | undefined;
export function domainErrorHttpStatus(
  error: unknown,
): DomainErrorHttpStatus | undefined {
  if (!(error instanceof DomainException)) return undefined;

  if (error instanceof MissingTenantContextError) {
    return {
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    };
  }
  if (error instanceof ConcurrencyConflictError) {
    return { statusCode: 409, error: 'Conflict', message: error.message };
  }
  if (error instanceof EntityNotFoundException) {
    return { statusCode: 404, error: 'Not Found', message: error.message };
  }
  return { statusCode: 400, error: 'Bad Request', message: error.message };
}
