/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { httpExchangeStore } from '@common/context/http-exchange.store';
import { sessionUserStore } from '@common/context/session-user.store';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../../auths/services/request-principal-resolver';

/**
 * Runs the rest of the request with its principal in `sessionUserStore` and its
 * secure session and response in `httpExchangeStore`, so handlers reach them
 * through ports. `next.handle()` must be called inside `run()`: Nest binds the
 * downstream call to the async context at that moment.
 */
@Injectable()
export class SessionUserContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthenticatedRequest>();
    const exchange = {
      session: req.session,
      response: http.getResponse<object>(),
    };
    return sessionUserStore.run(req.sessionUser, () =>
      httpExchangeStore.run(exchange, () => next.handle()),
    );
  }
}
