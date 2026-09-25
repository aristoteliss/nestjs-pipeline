/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import {
  type AuthenticatedRequest,
  RequestPrincipalResolver,
} from '../../auths/services/request-principal-resolver';

/**
 * Global authentication guard. It resolves the principal through
 * {@link RequestPrincipalResolver}, answers HTTP 401 for invalid, expired or
 * tenant-mismatched credentials, and stores the principal in `req.sessionUser`.
 *
 * @example
 * ```ts
 * // Registered globally in app.module.ts:
 * providers: [
 *   { provide: APP_GUARD, useClass: AuthSessionGuard },
 * ]
 * ```
 */
@Injectable()
export class AuthSessionGuard implements CanActivate {
  constructor(private readonly principalResolver: RequestPrincipalResolver) {}

  /**
   * Evaluates authentication for the active execution context.
   *
   * @param context - NestJS execution context.
   * @returns `true` if authentication succeeds or the endpoint allows anonymous access.
   * @throws {@link UnauthorizedException} If credentials were provided but are invalid or expired.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    req.sessionUser = await this.principalResolver.resolvePrincipal(req);
    return true;
  }
}
