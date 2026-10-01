/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { RateLimitExceededError } from '../errors/rate-limit-exceeded.error.js';

/**
 * Catches {@link RateLimitExceededError} thrown by {@link RateLimitBehavior} at
 * the pipeline boundary, mapping it to HTTP `429 Too Many Requests` with a
 * `Retry-After` header in seconds. It replies through Nest's HTTP adapter, so it
 * works on Express and Fastify, also for errors thrown in middleware.
 *
 * @example Register it globally, so Nest injects the adapter host
 * ```ts
 * @Module({ providers: [{ provide: APP_FILTER, useClass: RateLimitExceededFilter }] })
 * export class AppModule {}
 * ```
 */
@Catch(RateLimitExceededError)
export class RateLimitExceededFilter implements ExceptionFilter {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}

  catch(exception: RateLimitExceededError, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const response = host.switchToHttp().getResponse();
    httpAdapter.setHeader(
      response,
      'Retry-After',
      String(exception.retryAfterSeconds),
    );
    httpAdapter.reply(
      response,
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: exception.message,
        retryAfter: exception.retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
