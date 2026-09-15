/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
} from '@nestjs/common';
import { IdempotencyConflictError } from '../errors/idempotency-conflict.error';

type ErrorResponseBody = {
  statusCode: number;
  error: string;
  message: string;
  idempotencyKey: string;
  reason: string;
};

type HttpResponse = {
  status(code: number): HttpResponse;
  json?(body: ErrorResponseBody): unknown;
  send?(body: ErrorResponseBody): unknown;
};

/**
 * Catches {@link IdempotencyConflictError} thrown by {@link IdempotencyBehavior}
 * at the pipeline boundary, mapping it to `409 Conflict` (a duplicate is still
 * in progress) or `422 Unprocessable Entity` (the key was reused with a
 * different payload). Works with both Express and Fastify responses.
 *
 * Register it globally:
 * ```ts
 * app.useGlobalFilters(new IdempotencyConflictFilter());
 * ```
 */
@Catch(IdempotencyConflictError)
export class IdempotencyConflictFilter implements ExceptionFilter {
  catch(exception: IdempotencyConflictError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const body: ErrorResponseBody = {
      statusCode: exception.statusCode,
      error: exception.statusCode === 409 ? 'Conflict' : 'Unprocessable Entity',
      message: exception.message,
      idempotencyKey: exception.key,
      reason: exception.reason,
    };

    response.status(exception.statusCode);
    if (typeof response.json === 'function') {
      response.json(body);
      return;
    }
    response.send?.(body);
  }
}
