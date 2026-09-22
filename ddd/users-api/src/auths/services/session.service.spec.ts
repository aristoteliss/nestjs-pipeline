/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Session } from '@fastify/secure-session';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionData, SessionUser } from '../../common/types/SessionUser';
import type { SessionResponse } from '../responses/session.res';
import { SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService();
  });

  describe('saveSession', () => {
    const response: SessionResponse = {
      id: 'user-1',
      principalType: 'user',
      tenant: 'tenant_alpha',
      email: 'user@example.test',
      department: 'Engineering',
      accessToken: 'access-abc',
      accessTokenExpiresAt: 20_000_000,
    };

    it('stores the access token, principal, expiry, and optional sid', () => {
      const setMock = vi.fn();
      const mockSession = { set: setMock } as unknown as Session<SessionData>;

      service.saveSession(mockSession, response, 'sid-abc-123');

      expect(setMock).toHaveBeenCalledWith('user', {
        id: 'user-1',
        principalType: 'user',
        tenant: 'tenant_alpha',
        sid: 'sid-abc-123',
        exp: 20_000,
      });
      expect(setMock).toHaveBeenCalledWith('token', 'access-abc');
      expect(setMock).toHaveBeenCalledTimes(2);
    });

    it('does nothing when session is undefined', () => {
      expect(() => service.saveSession(undefined, response)).not.toThrow();
    });
  });

  describe('clearSession', () => {
    it('calls session.delete() when available', () => {
      const deleteMock = vi.fn();
      const mockSession = {
        delete: deleteMock,
      } as unknown as Session<SessionData>;

      service.clearSession(mockSession);

      expect(deleteMock).toHaveBeenCalledOnce();
    });

    it('deletes properties when session.delete is not a function', () => {
      const mockSession: Record<string, unknown> = {
        user: { id: 'u1' },
        token: 'tok',
      };

      service.clearSession(mockSession as unknown as Session<SessionData>);

      expect(mockSession.user).toBeUndefined();
      expect(mockSession.token).toBeUndefined();
    });

    it('does nothing when session is undefined', () => {
      expect(() => service.clearSession(undefined)).not.toThrow();
    });
  });

  describe('isExpired', () => {
    it('returns true when user is undefined', () => {
      expect(service.isExpired(undefined)).toBe(true);
    });

    it('returns false when no expiry fields are set', () => {
      const user: SessionUser = {
        id: 'u1',
        tenant: 't1',
        email: 'u1@test.com',
      };
      expect(service.isExpired(user)).toBe(false);
    });

    it('returns true when expiresAt is in the past', () => {
      const user: SessionUser = {
        id: 'u1',
        tenant: 't1',
        email: 'u1@test.com',
        expiresAt: Date.now() - 1000,
      };
      expect(service.isExpired(user)).toBe(true);
    });

    it('returns false when expiresAt is in the future', () => {
      const user: SessionUser = {
        id: 'u1',
        tenant: 't1',
        email: 'u1@test.com',
        expiresAt: Date.now() + 60000,
      };
      expect(service.isExpired(user)).toBe(false);
    });

    it('returns true when exp * 1000 is in the past', () => {
      const user: SessionUser = {
        id: 'u1',
        tenant: 't1',
        email: 'u1@test.com',
        exp: Math.floor(Date.now() / 1000) - 10,
      };
      expect(service.isExpired(user)).toBe(true);
    });

    it('returns false when exp * 1000 is in the future', () => {
      const user: SessionUser = {
        id: 'u1',
        tenant: 't1',
        email: 'u1@test.com',
        exp: Math.floor(Date.now() / 1000) + 60,
      };
      expect(service.isExpired(user)).toBe(false);
    });
  });
});
