/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { setTenantResolver } from '@cqrs-ddd/core/application';
import { currentTenantId } from '@cqrs-ddd/pipeline-tenant';
import type { Session } from '@fastify/secure-session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionData } from '../../common/types/session-principal.js';
import { ApiClientAuthenticator } from './api-client-authenticator.js';
import { JwtAuthenticator } from './jwt-authenticator.js';
import { RequestPrincipalResolver } from './request-principal-resolver.js';
import { SessionService } from './session.service.js';

const TENANT = 'tenant';

beforeEach(() => setTenantResolver(() => TENANT));
afterEach(() => setTenantResolver(currentTenantId));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RequestPrincipalResolver', () => {
  it('uses session cookie fast-path without invoking authenticators', async () => {
    const existingUser = {
      id: 'cookie-user-1',
      type: 'user' as const,
      tenant: TENANT,
      sid: 'cookie-sid-1',
      expiresAt: Date.now() + 60_000,
    };
    const session = {
      user: existingUser,
      delete: vi.fn(),
    } as unknown as Session<SessionData>;

    const jwtAuth = new JwtAuthenticator();
    const apiClientAuth = new ApiClientAuthenticator();
    const jwtSpy = vi.spyOn(jwtAuth, 'authenticate');
    const apiSpy = vi.spyOn(apiClientAuth, 'authenticate');

    const resolver = new RequestPrincipalResolver(
      jwtAuth,
      apiClientAuth,
      new SessionService(),
    );
    const user = await resolver.resolvePrincipal({ headers: {}, session });

    expect(user).toEqual(existingUser);
    expect(jwtSpy).not.toHaveBeenCalled();
    expect(apiSpy).not.toHaveBeenCalled();
  });

  it('clears and ignores a session cookie without a sid', async () => {
    const sessionPrincipalWithoutSid = {
      id: 'user-without-sid',
      type: 'user' as const,
      tenant: TENANT,
    };
    const deleteSession = vi.fn();
    const session = {
      user: sessionPrincipalWithoutSid,
      delete: deleteSession,
    } as unknown as Session<SessionData>;

    const resolver = new RequestPrincipalResolver(
      new JwtAuthenticator(),
      new ApiClientAuthenticator(),
      new SessionService(),
    );
    const user = await resolver.resolvePrincipal({ headers: {}, session });

    expect(user).toBeUndefined();
    expect(deleteSession).toHaveBeenCalledOnce();
  });

  it.each([
    ['without a principal type', {}],
    ['with an unknown principal type', { type: 'admin' }],
  ])(
    'clears session cookie and ignores a session user %s',
    async (_label, principal) => {
      const deleteSession = vi.fn();
      const session = {
        user: {
          id: 'cookie-user-1',
          tenant: TENANT,
          sid: 'cookie-sid-1',
          ...principal,
        },
        delete: deleteSession,
      } as unknown as Session<SessionData>;

      const resolver = new RequestPrincipalResolver(
        new JwtAuthenticator(),
        new ApiClientAuthenticator(),
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
      type: 'user' as const,
      tenant: 'mismatched-tenant',
      sid: 'cookie-sid-1',
      expiresAt: Date.now() + 60_000,
    };
    const session = {
      user: existingUser,
      delete: vi.fn(),
    } as unknown as Session<SessionData>;

    const resolver = new RequestPrincipalResolver(
      new JwtAuthenticator(),
      new ApiClientAuthenticator(),
      new SessionService(),
    );

    await expect(
      resolver.resolvePrincipal({ headers: {}, session }),
    ).rejects.toThrow('Credential tenant does not match the selected tenant');
  });

  it('rejects expired session cookie and clears session', async () => {
    const expiredUser = {
      id: 'expired-user-1',
      type: 'user' as const,
      tenant: TENANT,
      expiresAt: Date.now() - 5000,
    };
    const deleteSession = vi.fn();
    const session = {
      user: expiredUser,
      delete: deleteSession,
    } as unknown as Session<SessionData>;

    const resolver = new RequestPrincipalResolver(
      new JwtAuthenticator(),
      new ApiClientAuthenticator(),
      new SessionService(),
    );
    const user = await resolver.resolvePrincipal({ headers: {}, session });

    expect(user).toBeUndefined();
    expect(deleteSession).toHaveBeenCalledOnce();
  });

  it('rejects expired session cookie and falls through to valid JWT bearer', async () => {
    const expiredUser = {
      id: 'expired-user-1',
      type: 'user' as const,
      tenant: TENANT,
      expiresAt: Date.now() - 10_000,
    };
    const deleteSession = vi.fn();
    const session = {
      user: expiredUser,
      delete: deleteSession,
    } as unknown as Session<SessionData>;

    const jwtUser = {
      id: 'jwt-user-fresh',
      type: 'user' as const,
      tenant: TENANT,
    };
    const jwtAuth = new JwtAuthenticator();
    const apiClientAuth = new ApiClientAuthenticator();
    vi.spyOn(jwtAuth, 'authenticate').mockResolvedValue(jwtUser);

    const resolver = new RequestPrincipalResolver(
      jwtAuth,
      apiClientAuth,
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
      type: 'user' as const,
      tenant: TENANT,
      sid: 'cookie-sid-valid',
      expiresAt: Date.now() + 60000,
    };
    const session = {
      user: validUser,
      delete: vi.fn(),
    } as unknown as Session<SessionData>;

    const resolver = new RequestPrincipalResolver(
      new JwtAuthenticator(),
      new ApiClientAuthenticator(),
      new SessionService(),
    );
    const user = await resolver.resolvePrincipal({ headers: {}, session });

    expect(user).toEqual(validUser);
  });

  it('delegates to JwtAuthenticator when authorization header is provided without mutating session', async () => {
    const jwtUser = {
      id: 'jwt-user-1',
      type: 'user' as const,
      tenant: TENANT,
    };
    const session = {} as unknown as Session<SessionData>;
    const req = { headers: { authorization: 'Bearer token' }, session };

    const jwtAuth = new JwtAuthenticator();
    const apiClientAuth = new ApiClientAuthenticator();
    vi.spyOn(jwtAuth, 'authenticate').mockResolvedValue(jwtUser);

    const resolver = new RequestPrincipalResolver(
      jwtAuth,
      apiClientAuth,
      new SessionService(),
    );
    const user = await resolver.resolvePrincipal(req);

    expect(user).toEqual(jwtUser);
    expect(session.user).toBeUndefined();
  });

  it('delegates to ApiClientAuthenticator when x-api-id is provided', async () => {
    const apiUser = {
      id: 'client-1',
      type: 'service' as const,
      tenant: TENANT,
    };
    const session = {} as unknown as Session<SessionData>;
    const req = { headers: { 'x-api-id': 'client-1' }, session };

    const jwtAuth = new JwtAuthenticator();
    const apiClientAuth = new ApiClientAuthenticator();
    vi.spyOn(jwtAuth, 'authenticate').mockResolvedValue(undefined);
    vi.spyOn(apiClientAuth, 'authenticate').mockReturnValue(apiUser);

    const resolver = new RequestPrincipalResolver(
      jwtAuth,
      apiClientAuth,
      new SessionService(),
    );
    const user = await resolver.resolvePrincipal(req);

    expect(user).toEqual(apiUser);
  });

  it('returns undefined for anonymous caller', async () => {
    const session = {} as unknown as Session<SessionData>;
    const req = { headers: {}, session };

    const resolver = new RequestPrincipalResolver(
      new JwtAuthenticator(),
      new ApiClientAuthenticator(),
      new SessionService(),
    );
    const user = await resolver.resolvePrincipal(req);

    expect(user).toBeUndefined();
  });
});
