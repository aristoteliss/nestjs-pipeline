/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Inject,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { IdempotencyConflictError } from '../errors/idempotency-conflict.error.js';

/**
 * Catches {@link IdempotencyConflictError} thrown by {@link IdempotencyBehavior}
 * at the pipeline boundary, mapping it to `409 Conflict` (`in_progress`,
 * `replay_scope`) or `422 Unprocessable Entity` (`key_reuse`). It replies through
 * Nest's HTTP adapter, so it works on Express and Fastify, also for errors thrown
 * in middleware.
 *
 * @example Register it globally, so Nest injects the adapter host
 * ```ts
 * @Module({ providers: [{ provide: APP_FILTER, useClass: IdempotencyConflictFilter }] })
 * export class AppModule {}
 * ```
 */
@Catch(IdempotencyConflictError)
export class IdempotencyConflictFilter implements ExceptionFilter {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}

  catch(exception: IdempotencyConflictError, host: ArgumentsHost): void {
    this.adapterHost.httpAdapter.reply(
      host.switchToHttp().getResponse(),
      {
        statusCode: exception.statusCode,
        error:
          exception.statusCode === 409 ? 'Conflict' : 'Unprocessable Entity',
        message: exception.message,
        idempotencyKey: exception.key,
        reason: exception.reason,
      },
      exception.statusCode,
    );
  }
}
