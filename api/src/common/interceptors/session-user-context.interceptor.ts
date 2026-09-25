/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
 * Global interceptor responsible strictly for request-scoped AsyncLocalStorage context scoping.
 *
 * Reads `req.sessionUser` populated by {@link AuthSessionGuard} and establishes an ALS boundary
 * by wrapping the downstream execution stream with `sessionUserStore.run(req.sessionUser, () => next.handle())`.
 *
 * In NestJS 11.2.1, `InterceptorsConsumer` binds stream continuations using `defer(AsyncResource.bind(...))`,
 * guaranteeing that context established via `run()` remains isolated and active across all downstream
 * asynchronous microtasks (controllers, CQRS command/query handlers, CASL behaviors, and audit loggers).
 *
 * @example
 * ```ts
 * // Consuming the scoped context anywhere downstream:
 * import { getSessionUserFromStore } from '@common/context/session-user.store';
 *
 * @CommandHandler(DeleteUserCommand)
 * export class DeleteUserHandler {
 *   async handle(command: DeleteUserCommand) {
 *     const currentUser = getSessionUserFromStore();
 *     console.log('Action performed by:', currentUser?.id, currentUser?.tenant);
 *   }
 * }
 * ```
 */
@Injectable()
export class SessionUserContextInterceptor implements NestInterceptor {
  /**
   * Intercepts the execution stream and establishes the request-scoped session store.
   *
   * @param context - NestJS execution context.
   * @param next - Stream call handler.
   * @returns Observable stream executing within the scoped AsyncLocalStorage store.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return sessionUserStore.run(req.sessionUser, () => next.handle());
  }
}
