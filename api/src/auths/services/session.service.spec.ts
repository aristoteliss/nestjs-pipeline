/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { httpExchangeStore } from '@common/context/http-exchange.store';
import type { Session } from '@fastify/secure-session';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SessionData,
  SessionPrincipal,
} from '../../common/types/SessionPrincipal';
import type { AuthResult } from '../application/results/auth.result';
import { Auth } from '../domain/models/auth.entity';
import { SessionService } from './session.service';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/auths',
};

function result(refreshToken?: string): AuthResult {
  return {
    aggregate: Auth.create('user-1', 'hash', 9_000_000),
    userId: 'user-1',
    principalType: 'user',
    tenant: 'tenant_alpha',
    email: 'user@example.test',
    department: 'Engineering',
    accessToken: 'access-abc',
    accessTokenExpiresAt: 20_000_000,
    ...(refreshToken ? { refreshToken } : {}),
    sessionExpiresAt: 9_000_000,
  };
}

function secureSession() {
  const session = { set: vi.fn(), delete: vi.fn() };
  return { session, typed: session as unknown as Session<SessionData> };
}

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService();
  });

  describe('save', () => {
    it('sets the refresh token as a strict HttpOnly cookie that expires with the session', () => {
      const response = { cookie: vi.fn(), clearCookie: vi.fn() };

      httpExchangeStore.run({ response }, () =>
        service.save(result('refresh-secret')),
      );

      expect(response.cookie).toHaveBeenCalledExactlyOnceWith(
        'refresh_token',
        'refresh-secret',
        { ...COOKIE_OPTIONS, expires: new Date(9_000_000) },
      );
    });

    it('sets the refresh cookie through a Fastify reply', () => {
      const reply = { setCookie: vi.fn(), clearCookie: vi.fn() };

      httpExchangeStore.run({ response: reply }, () =>
        service.save(result('refresh-secret')),
      );

      expect(reply.setCookie).toHaveBeenCalledExactlyOnceWith(
        'refresh_token',
        'refresh-secret',
        { ...COOKIE_OPTIONS, expires: new Date(9_000_000) },
      );
    });

    it('leaves the refresh cookie unchanged for a grace-window answer', () => {
      const response = { cookie: vi.fn(), clearCookie: vi.fn() };

      httpExchangeStore.run({ response }, () => service.save(result()));

      expect(response.cookie).not.toHaveBeenCalled();
    });

    it('stores the access token and the principal with its session id in the secure session', () => {
      const issued = result('refresh-secret');
      const { session, typed } = secureSession();

      httpExchangeStore.run(
        { session: typed, response: { cookie: vi.fn(), clearCookie: vi.fn() } },
        () => service.save(issued),
      );

      expect(session.set).toHaveBeenCalledWith('user', {
        id: 'user-1',
        type: 'user',
        tenant: 'tenant_alpha',
        sid: issued.aggregate.id,
        exp: 20_000,
      });
      expect(session.set).toHaveBeenCalledWith('token', 'access-abc');
      expect(session.set).toHaveBeenCalledTimes(2);
    });

    it('does nothing outside an HTTP request', () => {
      expect(() => service.save(result('refresh-secret'))).not.toThrow();
    });
  });

  describe('clear', () => {
    it('deletes the secure session and clears the refresh cookie under its path', () => {
      const { session, typed } = secureSession();
      const response = { cookie: vi.fn(), clearCookie: vi.fn() };

      httpExchangeStore.run({ session: typed, response }, () =>
        service.clear(),
      );

      expect(session.delete).toHaveBeenCalledOnce();
      expect(response.clearCookie).toHaveBeenCalledExactlyOnceWith(
        'refresh_token',
        COOKIE_OPTIONS,
      );
    });

    it('does nothing outside an HTTP request', () => {
      expect(() => service.clear()).not.toThrow();
    });
  });

  describe('discard', () => {
    it('deletes only the given secure session', () => {
      const { session, typed } = secureSession();

      service.discard(typed);

      expect(session.delete).toHaveBeenCalledOnce();
    });

    it('does nothing without a session', () => {
      expect(() => service.discard(undefined)).not.toThrow();
    });
  });

  describe('isExpired', () => {
    it('returns true when user is undefined', () => {
      expect(service.isExpired(undefined)).toBe(true);
    });

    it('returns false when no expiry fields are set', () => {
      const user: SessionPrincipal = {
        id: 'u1',
        type: 'user',
        tenant: 't1',
        email: 'u1@test.com',
      };
      expect(service.isExpired(user)).toBe(false);
    });

    it('returns true when expiresAt is in the past', () => {
      const user: SessionPrincipal = {
        id: 'u1',
        type: 'user',
        tenant: 't1',
        email: 'u1@test.com',
        expiresAt: Date.now() - 1000,
      };
      expect(service.isExpired(user)).toBe(true);
    });

    it('returns false when expiresAt is in the future', () => {
      const user: SessionPrincipal = {
        id: 'u1',
        type: 'user',
        tenant: 't1',
        email: 'u1@test.com',
        expiresAt: Date.now() + 60000,
      };
      expect(service.isExpired(user)).toBe(false);
    });

    it('returns true when exp * 1000 is in the past', () => {
      const user: SessionPrincipal = {
        id: 'u1',
        type: 'user',
        tenant: 't1',
        email: 'u1@test.com',
        exp: Math.floor(Date.now() / 1000) - 10,
      };
      expect(service.isExpired(user)).toBe(true);
    });

    it('returns false when exp * 1000 is in the future', () => {
      const user: SessionPrincipal = {
        id: 'u1',
        type: 'user',
        tenant: 't1',
        email: 'u1@test.com',
        exp: Math.floor(Date.now() / 1000) + 60,
      };
      expect(service.isExpired(user)).toBe(false);
    });
  });
});
