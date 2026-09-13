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

import { describe, expect, it, vi } from 'vitest';
import { DeleteAuthCommand } from '../cqrs/commands/delete-auth.command';
import { Auth } from '../domain/models/auth.entity';
import { AuthsController } from './auths.controller';

describe('AuthsController', () => {
  describe('logout', () => {
    it('extracts credentials directly via SessionService and JwtAuthenticator, dispatches DeleteAuthCommand, and clears session', async () => {
      const mockCommandBus = {
        execute: vi.fn().mockResolvedValue(undefined),
      };
      const mockSessionService = {
        saveSession: vi.fn(),
        clearSession: vi.fn(),
        getCredentials: vi.fn().mockReturnValue({
          userId: 'user-xyz',
          token: undefined,
        }),
      };
      const mockJwtAuthenticator = {
        extractToken: vi.fn().mockReturnValue('token-abc'),
        extractUserId: vi.fn(),
      };

      const controller = new AuthsController(
        mockCommandBus as never,
        mockSessionService as never,
        mockJwtAuthenticator as never,
      );

      const mockSession = { id: 'sess-1' };
      const mockHeaders = {
        authorization: 'Bearer token-abc',
      };

      await controller.logout({
        session: mockSession as never,
        headers: mockHeaders,
      });

      expect(mockSessionService.getCredentials).toHaveBeenCalledWith(
        mockSession,
      );
      expect(mockJwtAuthenticator.extractToken).toHaveBeenCalledWith(
        mockHeaders,
      );
      expect(mockCommandBus.execute).toHaveBeenCalledOnce();
      const dispatchedCommand = mockCommandBus.execute.mock.calls[0][0];
      expect(dispatchedCommand).toBeInstanceOf(DeleteAuthCommand);
      expect(dispatchedCommand.userId).toBe('user-xyz');
      expect(dispatchedCommand.token).toBe('token-abc');
      expect(mockSessionService.clearSession).toHaveBeenCalledWith(mockSession);
    });

    it('extracts userId from JwtAuthenticator when session is absent', async () => {
      const mockCommandBus = {
        execute: vi.fn().mockResolvedValue(undefined),
      };
      const mockSessionService = {
        saveSession: vi.fn(),
        clearSession: vi.fn(),
        getCredentials: vi.fn().mockReturnValue({}),
      };
      const mockJwtAuthenticator = {
        extractToken: vi.fn().mockReturnValue('token-header-only'),
        extractUserId: vi.fn().mockResolvedValue('user-header-only'),
      };

      const controller = new AuthsController(
        mockCommandBus as never,
        mockSessionService as never,
        mockJwtAuthenticator as never,
      );

      const mockHeaders = { authorization: 'Bearer token-header-only' };

      await controller.logout({
        headers: mockHeaders,
      });

      expect(mockJwtAuthenticator.extractToken).toHaveBeenCalledWith(
        mockHeaders,
      );
      expect(mockJwtAuthenticator.extractUserId).toHaveBeenCalledWith(
        mockHeaders,
      );
      expect(mockCommandBus.execute).toHaveBeenCalledOnce();
      const dispatchedCommand = mockCommandBus.execute.mock.calls[0][0];
      expect(dispatchedCommand.userId).toBe('user-header-only');
      expect(dispatchedCommand.token).toBe('token-header-only');
      expect(mockSessionService.clearSession).toHaveBeenCalledWith(undefined);
    });

    it('does not dispatch DeleteAuthCommand when no credentials are found (anonymous logout)', async () => {
      const mockCommandBus = {
        execute: vi.fn(),
      };
      const mockSessionService = {
        saveSession: vi.fn(),
        clearSession: vi.fn(),
        getCredentials: vi.fn().mockReturnValue({}),
      };
      const mockJwtAuthenticator = {
        extractToken: vi.fn().mockReturnValue(undefined),
        extractUserId: vi.fn().mockResolvedValue(undefined),
      };

      const controller = new AuthsController(
        mockCommandBus as never,
        mockSessionService as never,
        mockJwtAuthenticator as never,
      );

      const mockSession = { id: 'sess-anon' };
      await controller.logout({
        session: mockSession as never,
      });

      expect(mockCommandBus.execute).not.toHaveBeenCalled();
      expect(mockSessionService.clearSession).toHaveBeenCalledWith(mockSession);
    });

    it('handles cookie-only session logout when token is stored on session', async () => {
      const mockCommandBus = {
        execute: vi.fn().mockResolvedValue(undefined),
      };
      const mockSessionService = {
        saveSession: vi.fn(),
        clearSession: vi.fn(),
        getCredentials: vi.fn().mockReturnValue({
          userId: 'user-cookie-1',
          token: 'token-from-cookie',
        }),
      };
      const mockJwtAuthenticator = {
        extractToken: vi.fn().mockReturnValue(undefined),
        extractUserId: vi.fn(),
      };

      const controller = new AuthsController(
        mockCommandBus as never,
        mockSessionService as never,
        mockJwtAuthenticator as never,
      );

      const mockSession = {
        user: { id: 'user-cookie-1', tenant: 'tenant_a' },
        token: 'token-from-cookie',
      };

      await controller.logout({
        session: mockSession as never,
      });

      expect(mockSessionService.getCredentials).toHaveBeenCalledWith(
        mockSession,
      );
      expect(mockCommandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-cookie-1',
          token: 'token-from-cookie',
        }),
      );
      expect(mockSessionService.clearSession).toHaveBeenCalledWith(mockSession);
    });
  });

  describe('login', () => {
    it('executes CreateAuthCommand and updates session via sessionService.saveSession', async () => {
      const auth = Auth.create('usr-1', 'token-new');
      const createAuthResult = {
        aggregate: auth,
        id: 'usr-1',
        principalType: 'user' as const,
        tenant: 'tenant_a',
        email: 'user@example.test',
        department: 'sales',
        capabilities: { roles: [] },
        token: 'token-new',
        expiresAt: 12345678,
        exp: 12345,
      };
      const mockCommandBus = {
        execute: vi.fn().mockResolvedValue(createAuthResult),
      };
      const mockSessionService = {
        saveSession: vi.fn(),
        clearSession: vi.fn(),
      };
      const mockJwtAuthenticator = {
        extractToken: vi.fn(),
        extractUserId: vi.fn(),
      };

      const controller = new AuthsController(
        mockCommandBus as never,
        mockSessionService as never,
        mockJwtAuthenticator as never,
      );

      const mockSession: Record<string, unknown> = {};
      const result = await controller.login(
        { email: 'user@example.test', code: '123456' },
        { session: mockSession as never },
      );

      expect(result).toEqual({
        id: 'usr-1',
        principalType: 'user',
        tenant: 'tenant_a',
        email: 'user@example.test',
        department: 'sales',
        capabilities: { roles: [] },
        token: 'token-new',
        expiresAt: 12345678,
        exp: 12345,
      });
      expect(mockSessionService.saveSession).toHaveBeenCalledWith(
        mockSession,
        result,
      );
    });
  });
});
