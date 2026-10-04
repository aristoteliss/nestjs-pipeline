/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type ArgumentsHost, Catch, type HttpServer } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { httpAnswer } from './http-exception.js';

/**
 * Answers every error through NestJS's own exception handling: an error of a
 * `@cqrs-ddd` package is first converted to its NestJS `HttpException` (see
 * `httpAnswer`), with its headers such as `Retry-After`; anything else is
 * handled exactly as Nest handles it by default. It works on Express and
 * Fastify, also for errors thrown in middleware.
 *
 * @example
 * ```ts
 * @Module({ providers: [{ provide: APP_FILTER, useClass: ErrorFilter }] })
 * export class AppModule {}
 * ```
 */
@Catch()
export class ErrorFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const answer = httpAnswer(exception);
    if (answer) {
      const adapter = (this.httpAdapterHost?.httpAdapter ??
        this.applicationRef) as HttpServer;
      const response = host.getArgByIndex(1);
      for (const [name, value] of Object.entries(answer.headers)) {
        adapter.setHeader(response, name, value);
      }
    }
    super.catch(answer?.exception ?? exception, host);
  }
}
