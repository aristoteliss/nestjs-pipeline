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

import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '../../auths/services/request-principal-resolver';
import { RequestPrincipalResolver } from '../../auths/services/request-principal-resolver';
import { AuthSessionGuard } from './auth-session.guard';

function makeContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AuthSessionGuard', () => {
  it('resolves principal, attaches to req.sessionUser, and returns true', async () => {
    const resolvedUser = { id: 'resolved-user', tenant: 'test-tenant' };
    const req: AuthenticatedRequest = { headers: {} };
    const context = makeContext(req);

    const principalResolver = {
      resolvePrincipal: vi.fn().mockResolvedValue(resolvedUser),
    } as unknown as RequestPrincipalResolver;

    const guard = new AuthSessionGuard(principalResolver);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req.sessionUser).toEqual(resolvedUser);
    expect(principalResolver.resolvePrincipal).toHaveBeenCalledWith(req);
  });

  it('rejects when auth service throws UnauthorizedException', async () => {
    const req: AuthenticatedRequest = { headers: {} };
    const context = makeContext(req);

    const principalResolver = {
      resolvePrincipal: vi
        .fn()
        .mockRejectedValue(new UnauthorizedException('Invalid token')),
    } as unknown as RequestPrincipalResolver;

    const guard = new AuthSessionGuard(principalResolver);
    await expect(guard.canActivate(context)).rejects.toThrow('Invalid token');
    expect(req.sessionUser).toBeUndefined();
  });
});
