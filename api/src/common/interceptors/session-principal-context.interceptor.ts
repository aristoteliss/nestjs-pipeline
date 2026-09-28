/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { httpExchangeStore } from '@common/context/http-exchange.store';
import { sessionPrincipalStore } from '@common/context/session-principal.store';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../../auths/services/request-principal-resolver';

/**
 * Runs the rest of the request with its principal in `sessionPrincipalStore` and its
 * secure session and response in `httpExchangeStore`, so handlers reach them
 * through ports. `next.handle()` must be called inside `run()`: Nest binds the
 * downstream call to the async context at that moment.
 */
@Injectable()
export class SessionPrincipalContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthenticatedRequest>();
    const exchange = {
      session: req.session,
      response: http.getResponse<object>(),
    };
    return sessionPrincipalStore.run(req.sessionPrincipal, () =>
      httpExchangeStore.run(exchange, () => next.handle()),
    );
  }
}
