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
    it('sets user and token on the session when session is defined', () => {
      const setMock = vi.fn();
      const mockSession = { set: setMock } as unknown as Session<SessionData>;

      const sessionResponse: SessionResponse = {
        id: 'user-1',
        tenant: 'tenant_alpha',
        email: 'user@example.test',
        department: 'Engineering',
        capabilities: {
          roles: ['admin'],
          additionalCapabilities: [],
          deniedCapabilities: [],
        },
        token: 'token-abc',
        expiresAt: 10000,
        exp: 20000,
      };

      service.saveSession(mockSession, sessionResponse);

      expect(setMock).toHaveBeenCalledWith('user', {
        id: 'user-1',
        tenant: 'tenant_alpha',
        email: 'user@example.test',
        department: 'Engineering',
        capabilities: sessionResponse.capabilities,
        expiresAt: 10000,
        exp: 20000,
      });
      expect(setMock).toHaveBeenCalledWith('token', 'token-abc');
    });

    it('handles undefined department gracefully', () => {
      const setMock = vi.fn();
      const mockSession = { set: setMock } as unknown as Session<SessionData>;

      const sessionResponse: SessionResponse = {
        id: 'user-2',
        tenant: 'tenant_beta',
        email: 'user2@example.test',
        token: 'token-xyz',
      };

      service.saveSession(mockSession, sessionResponse);

      expect(setMock).toHaveBeenCalledWith('user', {
        id: 'user-2',
        tenant: 'tenant_beta',
        email: 'user2@example.test',
        department: undefined,
        capabilities: undefined,
        expiresAt: undefined,
        exp: undefined,
      });
    });

    it('does nothing when session is undefined', () => {
      expect(() =>
        service.saveSession(undefined, {
          id: 'user-1',
          tenant: 'tenant_alpha',
          email: 'user@test.com',
          token: 'tok',
        }),
      ).not.toThrow();
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

  describe('getCredentials', () => {
    it('returns empty object when session is undefined', () => {
      expect(service.getCredentials(undefined)).toEqual({});
    });

    it('extracts userId and token from session properties', () => {
      const mockSession = {
        user: { id: 'user-123' },
        token: 'token-456',
      } as unknown as Session<SessionData>;

      const creds = service.getCredentials(mockSession);
      expect(creds).toEqual({
        userId: 'user-123',
        token: 'token-456',
      });
    });

    it('falls back to session.get("token") if session.token is undefined', () => {
      const mockSession = {
        user: { id: 'user-789' },
        get: vi.fn().mockReturnValue('token-via-get'),
      } as unknown as Session<SessionData>;

      const creds = service.getCredentials(mockSession);
      expect(creds).toEqual({
        userId: 'user-789',
        token: 'token-via-get',
      });
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
