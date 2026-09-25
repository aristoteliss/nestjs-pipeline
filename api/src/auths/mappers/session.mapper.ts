/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { CreateAuthResult } from '../cqrs/results/create-auth.result';
import type { SessionResponse } from '../responses/session.res';

/**
 * Maps the application-level {@link CreateAuthResult} to the HTTP {@link SessionResponse}.
 *
 * @example
 * ```typescript
 * const result = await this.commandBus.execute<CreateAuthCommand, CreateAuthResult>(command);
 * const sessionRes = toSessionRes(result);
 * this.sessionService.saveSession(req.session, sessionRes);
 * return sessionRes;
 * ```
 */
export function toSessionRes(result: CreateAuthResult): SessionResponse {
  return {
    id: result.id,
    principalType: result.principalType,
    tenant: result.tenant,
    email: result.email,
    department: result.department ?? null,
    accessToken: result.accessToken,
    accessTokenExpiresAt: result.accessTokenExpiresAt,
  };
}
