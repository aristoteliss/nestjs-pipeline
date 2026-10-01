/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ZodValidationError } from '../errors/zod-validation.error';

/**
 * Catches {@link ZodValidationError} thrown by `createCommand()`, `createQuery()`,
 * or `createZodRequest()` constructors and {@link ZodValidationBehavior} at the
 * pipeline boundary, and answers HTTP 400 with
 * `{ statusCode, error, message, details }`. It replies through Nest's HTTP
 * adapter, so it works on Express and Fastify, also for errors thrown in
 * middleware.
 *
 * @example Register it globally, so Nest injects the adapter host
 * ```ts
 * @Module({ providers: [{ provide: APP_FILTER, useClass: ZodValidationFilter }] })
 * export class AppModule {}
 * ```
 */
@Catch(ZodValidationError)
export class ZodValidationFilter implements ExceptionFilter {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}

  catch(exception: ZodValidationError, host: ArgumentsHost): void {
    this.adapterHost.httpAdapter.reply(
      host.switchToHttp().getResponse(),
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: exception.message,
        details: exception.details,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
