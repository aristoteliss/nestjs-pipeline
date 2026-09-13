/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import type { CreateAuthResult } from '../cqrs/results/create-auth.result';
import type { SessionResponse } from '../responses/session.res';

/**
 * Maps the application-level {@link CreateAuthResult} to the HTTP {@link SessionResponse}.
 *
 * Sits in the mapper layer between application command handlers/results and the presentation controller.
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
    tenant: result.tenant,
    email: result.email,
    department: result.department ?? null,
    capabilities: result.capabilities,
    token: result.token,
    expiresAt: result.expiresAt,
    exp: result.exp,
  };
}
