/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { httpCorrelation } from '@cqrs-ddd/pipeline-correlation';
import { Injectable, type NestMiddleware } from '@nestjs/common';

/**
 * Takes the correlation id of every request from its header, or creates one,
 * runs the request with it so the pipelines it starts take it, and echoes it
 * on the response: `httpCorrelation()` of `@cqrs-ddd/pipeline-correlation` as
 * a NestJS middleware.
 *
 * @example
 * ```ts
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(CorrelationMiddleware).forRoutes('*');
 *   }
 * }
 * ```
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  private readonly correlate = httpCorrelation();

  use(request: IncomingMessage, response: ServerResponse, next: () => void) {
    this.correlate(request, response, next);
  }
}
