/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

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
  status(code: number): { json(body: ErrorResponseBody): void };
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

    response.status(exception.statusCode).json({
      statusCode: exception.statusCode,
      error: exception.statusCode === 409 ? 'Conflict' : 'Unprocessable Entity',
      message: exception.message,
      idempotencyKey: exception.key,
      reason: exception.reason,
    });
  }
}
