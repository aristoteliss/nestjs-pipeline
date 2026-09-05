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

import type { Session } from '@fastify/secure-session';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionData } from '../../common/types/SessionUser';
import { ApiClientAuthenticator } from './api-client-authenticator';
import { JwtAuthenticator } from './jwt-authenticator';
import { RequestPrincipalResolver } from './request-principal-resolver';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RequestPrincipalResolver', () => {
  const tenantContext = new TenantSchemaContext();

  it('uses session cookie fast-path without invoking authenticators', async () => {
    const existingUser = {
      id: 'cookie-user-1',
      tenant: tenantContext.schema,
    };
    const session = {
      user: existingUser,
    } as unknown as Session<SessionData>;

    const jwtAuth = new JwtAuthenticator(tenantContext);
    const apiClientAuth = new ApiClientAuthenticator(tenantContext);
    const jwtSpy = vi.spyOn(jwtAuth, 'authenticate');
    const apiSpy = vi.spyOn(apiClientAuth, 'authenticate');

    const resolver = new RequestPrincipalResolver(
      jwtAuth,
      apiClientAuth,
      tenantContext,
    );
    const user = await resolver.resolvePrincipal({ headers: {}, session });

    expect(user).toEqual(existingUser);
    expect(jwtSpy).not.toHaveBeenCalled();
    expect(apiSpy).not.toHaveBeenCalled();
  });

  it('rejects session cookie when tenant does not match', async () => {
    const existingUser = {
      id: 'cookie-user-1',
      tenant: 'mismatched-tenant',
    };
    const session = {
      user: existingUser,
    } as unknown as Session<SessionData>;

    const resolver = new RequestPrincipalResolver(
      new JwtAuthenticator(tenantContext),
      new ApiClientAuthenticator(tenantContext),
      tenantContext,
    );

    await expect(
      resolver.resolvePrincipal({ headers: {}, session }),
    ).rejects.toThrow('Credential tenant does not match the selected tenant');
  });

  it('delegates to JwtAuthenticator when authorization header is provided', async () => {
    const jwtUser = {
      id: 'jwt-user-1',
      tenant: tenantContext.schema,
    };
    const session = {} as unknown as Session<SessionData>;
    const req = { headers: { authorization: 'Bearer token' }, session };

    const jwtAuth = new JwtAuthenticator(tenantContext);
    const apiClientAuth = new ApiClientAuthenticator(tenantContext);
    vi.spyOn(jwtAuth, 'authenticate').mockResolvedValue(jwtUser);

    const resolver = new RequestPrincipalResolver(
      jwtAuth,
      apiClientAuth,
      tenantContext,
    );
    const user = await resolver.resolvePrincipal(req);

    expect(user).toEqual(jwtUser);
    expect(session.user).toEqual(jwtUser);
  });

  it('delegates to ApiClientAuthenticator when x-api-id is provided', async () => {
    const apiUser = {
      id: 'client-1',
      tenant: tenantContext.schema,
    };
    const session = {} as unknown as Session<SessionData>;
    const req = { headers: { 'x-api-id': 'client-1' }, session };

    const jwtAuth = new JwtAuthenticator(tenantContext);
    const apiClientAuth = new ApiClientAuthenticator(tenantContext);
    vi.spyOn(jwtAuth, 'authenticate').mockResolvedValue(undefined);
    vi.spyOn(apiClientAuth, 'authenticate').mockReturnValue(apiUser);

    const resolver = new RequestPrincipalResolver(
      jwtAuth,
      apiClientAuth,
      tenantContext,
    );
    const user = await resolver.resolvePrincipal(req);

    expect(user).toEqual(apiUser);
  });

  it('returns undefined for anonymous caller', async () => {
    const session = {} as unknown as Session<SessionData>;
    const req = { headers: {}, session };

    const resolver = new RequestPrincipalResolver(
      new JwtAuthenticator(tenantContext),
      new ApiClientAuthenticator(tenantContext),
      tenantContext,
    );
    const user = await resolver.resolvePrincipal(req);

    expect(user).toBeUndefined();
  });
});
