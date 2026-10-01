/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { context } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import type { Observable } from 'rxjs';

/** The matched route template on an Express (`route.path`) or Fastify (`routeOptions.url`) request. */
type RoutedRequest = {
  route?: { path?: string };
  routeOptions?: { url?: string };
};

/**
 * Gives OpenTelemetry's HTTP server span the route template of the matched
 * handler, such as `/users/:id`. The HTTP instrumentation then sets `http.route`
 * and names the span `GET /users/:id` when the response finishes. Without an
 * active HTTP span, it does nothing.
 *
 * A request rejected before interceptors run, by a guard or by middleware, keeps
 * the span name of its method alone.
 *
 * @example
 * ```ts
 * @Module({
 *   providers: [{ provide: APP_INTERCEPTOR, useClass: HttpRouteInterceptor }],
 * })
 * export class ObservabilityModule {}
 * ```
 */
@Injectable()
export class HttpRouteInterceptor implements NestInterceptor {
  intercept(
    execution: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (execution.getType() === 'http') {
      const metadata = getRPCMetadata(context.active());
      if (metadata?.type === RPCType.HTTP) {
        const request = execution.switchToHttp().getRequest<RoutedRequest>();
        metadata.route = request.routeOptions?.url ?? request.route?.path;
      }
    }
    return next.handle();
  }
}
