/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { UnauthorizedActionException } from '../errors/unauthorized-action.exception';

/**
 * Catches {@link UnauthorizedActionException} thrown from domain entities or CQRS handlers
 * and maps it to HTTP 403 Forbidden at the HTTP boundary, with the denied `action` and
 * `subject`. It replies through Nest's HTTP adapter, so it works on Express and Fastify,
 * also for errors thrown in middleware.
 *
 * @example Register it globally, so Nest injects the adapter host
 * ```ts
 * @Module({ providers: [{ provide: APP_FILTER, useClass: UnauthorizedActionFilter }] })
 * export class AppModule {}
 * ```
 */
@Catch(UnauthorizedActionException)
export class UnauthorizedActionFilter implements ExceptionFilter {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}

  catch(exception: UnauthorizedActionException, host: ArgumentsHost): void {
    this.adapterHost.httpAdapter.reply(
      host.switchToHttp().getResponse(),
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
        message: exception.message,
        action: exception.action,
        subject: exception.subject,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
