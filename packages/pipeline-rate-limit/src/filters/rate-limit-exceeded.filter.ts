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
  HttpStatus,
} from '@nestjs/common';
import { RateLimitExceededError } from '../errors/rate-limit-exceeded.error';

type ErrorResponseBody = {
  statusCode: number;
  error: string;
  message: string;
  retryAfter: number;
};

type HttpResponse = {
  status(code: number): HttpResponse;
  /** Express-style JSON sender. */
  json?(body: ErrorResponseBody): unknown;
  /** Fastify-style body sender. */
  send?(body: ErrorResponseBody): unknown;
  /** Fastify-style header setter. */
  header?(name: string, value: string): unknown;
  /** Express-style header setter. */
  setHeader?(name: string, value: string): unknown;
};

/**
 * Catches {@link RateLimitExceededError} thrown by {@link RateLimitBehavior} at
 * the pipeline boundary, mapping it to HTTP `429 Too Many Requests` and setting
 * a `Retry-After` header (works with both Express and Fastify responses).
 *
 * Register it globally:
 * ```ts
 * app.useGlobalFilters(new RateLimitExceededFilter());
 * ```
 */
@Catch(RateLimitExceededError)
export class RateLimitExceededFilter implements ExceptionFilter {
  catch(exception: RateLimitExceededError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpResponse>();
    const retryAfter = String(exception.retryAfterSeconds);
    const body: ErrorResponseBody = {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      error: 'Too Many Requests',
      message: exception.message,
      retryAfter: exception.retryAfterSeconds,
    };

    if (typeof response.header === 'function') {
      response.header('Retry-After', retryAfter);
    } else if (typeof response.setHeader === 'function') {
      response.setHeader('Retry-After', retryAfter);
    }

    response.status(HttpStatus.TOO_MANY_REQUESTS);
    if (typeof response.json === 'function') {
      response.json(body);
      return;
    }
    response.send?.(body);
  }
}
