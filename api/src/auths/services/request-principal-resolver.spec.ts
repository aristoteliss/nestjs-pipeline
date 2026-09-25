/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Session } from '@fastify/secure-session';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionData } from '../../common/types/SessionUser';
import { ApiClientAuthenticator } from './api-client-authenticator';
import { JwtAuthenticator } from './jwt-authenticator';
import { RequestPrincipalResolver } from './request-principal-resolver';
import { SessionService } from './session.service';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RequestPrincipalResolver', () => {
  const tenantContext = new TenantSchemaContext();
  it('uses session cookie fast-path without invoking authenticators', async () => {
    const existingUser = {
      id: 'cookie-user-1',
      principalType: 'user' as const,
      tenant: tenantContext.schema,
      sid: 'cookie-sid-1',
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
      new SessionService(),
    );
    const user = await resolver.resolvePrincipal({ headers: {}, session });

    expect(user).toEqual(existingUser);
    expect(jwtSpy).not.toHaveBeenCalled();
    expect(apiSpy).not.toHaveBeenCalled();
  });

  it('clears session cookie and ignores legacy session without sid', async () => {
    const legacyUser = {
      id: 'legacy-user-1',
      principalType: 'user' as const,
      tenant: tenantContext.schema,
    };
    const deleteSession = vi.fn();
    const session = {
      user: legacyUser,
      delete: deleteSession,
    } as unknown as Session<SessionData>;

    const resolver = new RequestPrincipalResolver(
      new JwtAuthenticator(tenantContext),
      new ApiClientAuthenticator(tenantContext),
      tenantContext,
      new SessionService(),
    );
    const user = await resolver.resolvePrincipal({ headers: {}, session });

    expect(user).toBeUndefined();
    expect(deleteSession).toHaveBeenCalledOnce();
  });

  it.each([
    ['without a principal type', {}],
    ['with an unknown principal type', { principalType: 'admin' }],
  ])(
    'clears session cookie and ignores a session user %s',
    async (_label, principal) => {
      const deleteSession = vi.fn();
      const session = {
        user: {
          id: 'cookie-user-1',
          tenant: tenantContext.schema,
          sid: 'cookie-sid-1',
          ...principal,
        },
        delete: deleteSession,
      } as unknown as Session<SessionData>;

      const resolver = new RequestPrincipalResolver(
        new JwtAuthenticator(tenantContext),
        new ApiClientAuthenticator(tenantContext),
        tenantContext,
        new SessionService(),
      );
      const user = await resolver.resolvePrincipal({ headers: {}, session });

      expect(user).toBeUndefined();
      expect(deleteSession).toHaveBeenCalledOnce();
    },
  );

  it('rejects session cookie when tenant does not match', async () => {
    const existingUser = {
      id: 'cookie-user-1',
      principalType: 'user' as const,
      tenant: 'mismatched-tenant',
      sid: 'cookie-sid-1',
    };
    const session = {
      user: existingUser,
    } as unknown as Session<SessionData>;

    const resolver = new RequestPrincipalResolver(
      new JwtAuthenticator(tenantContext),
      new ApiClientAuthenticator(tenantContext),
      tenantContext,
      new SessionService(),
    );

    await expect(
      resolver.resolvePrincipal({ headers: {}, session }),
    ).rejects.toThrow('Credential tenant does not match the selected tenant');
  });

  it('rejects expired session cookie and clears session', async () => {
    const expiredUser = {
      id: 'expired-user-1',
      principalType: 'user' as const,
      tenant: tenantContext.schema,
      expiresAt: Date.now() - 5000,
    };
    const deleteSession = vi.fn();
    const session = {
      user: expiredUser,
      delete: deleteSession,
    } as unknown as Session<SessionData>;

    const resolver = new RequestPrincipalResolver(
      new JwtAuthenticator(tenantContext),
      new ApiClientAuthenticator(tenantContext),
      tenantContext,
      new SessionService(),
    );
    const user = await resolver.resolvePrincipal({ headers: {}, session });

    expect(user).toBeUndefined();
    expect(deleteSession).toHaveBeenCalledOnce();
  });

  it('rejects expired session cookie and falls through to valid JWT bearer', async () => {
    const expiredUser = {
      id: 'expired-user-1',
      principalType: 'user' as const,
      tenant: tenantContext.schema,
      exp: Math.floor(Date.now() / 1000) - 10,
    };
    const deleteSession = vi.fn();
    const session = {
      user: expiredUser,
      delete: deleteSession,
    } as unknown as Session<SessionData>;

    const jwtUser = {
      id: 'jwt-user-fresh',
      principalType: 'user' as const,
      tenant: tenantContext.schema,
    };
    const jwtAuth = new JwtAuthenticator(tenantContext);
    const apiClientAuth = new ApiClientAuthenticator(tenantContext);
    vi.spyOn(jwtAuth, 'authenticate').mockResolvedValue(jwtUser);

    const resolver = new RequestPrincipalResolver(
      jwtAuth,
      apiClientAuth,
      tenantContext,
      new SessionService(),
    );
    const user = await resolver.resolvePrincipal({
      headers: { authorization: 'Bearer fresh-token' },
      session,
    });

    expect(user).toEqual(jwtUser);
    expect(deleteSession).toHaveBeenCalledOnce();
  });

  it('accepts unexpired session cookie with future expiresAt', async () => {
    const validUser = {
      id: 'cookie-user-valid',
      principalType: 'user' as const,
      tenant: tenantContext.schema,
      sid: 'cookie-sid-valid',
      expiresAt: Date.now() + 60000,
    };
    const session = {
      user: validUser,
    } as unknown as Session<SessionData>;

    const resolver = new RequestPrincipalResolver(
      new JwtAuthenticator(tenantContext),
      new ApiClientAuthenticator(tenantContext),
      tenantContext,
      new SessionService(),
    );
    const user = await resolver.resolvePrincipal({ headers: {}, session });

    expect(user).toEqual(validUser);
  });

  it('delegates to JwtAuthenticator when authorization header is provided without mutating session', async () => {
    const jwtUser = {
      id: 'jwt-user-1',
      principalType: 'user' as const,
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
      new SessionService(),
    );
    const user = await resolver.resolvePrincipal(req);

    expect(user).toEqual(jwtUser);
    expect(session.user).toBeUndefined();
  });

  it('delegates to ApiClientAuthenticator when x-api-id is provided', async () => {
    const apiUser = {
      id: 'client-1',
      principalType: 'service' as const,
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
      new SessionService(),
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
      new SessionService(),
    );
    const user = await resolver.resolvePrincipal(req);

    expect(user).toBeUndefined();
  });
});
