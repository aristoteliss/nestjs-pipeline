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
import { Injectable } from '@nestjs/common';
import type { SessionData, SessionUser } from '../../common/types/SessionUser';
import type { SessionResponse } from '../responses/session.res';

/**
 * Presentation-layer service managing HTTP cookie session lifecycle and data access.
 *
 * Encapsulates reading, writing, clearing, and validating expiration for `@fastify/secure-session`
 * instances, ensuring presentation transport details do not leak into application or domain services.
 */
@Injectable()
export class SessionService {
  /**
   * Saves authenticated session data and bearer token into the Fastify session cookie.
   *
   * @param session - Active Fastify secure session instance, if present on the request.
   * @param data - Authenticated user response DTO containing user metadata and token.
   *
   * @example
   * ```typescript
   * const sessionRes = toSessionRes(createAuthResult);
   * this.sessionService.saveSession(req.session, sessionRes);
   * ```
   */
  saveSession(
    session: Session<SessionData> | undefined,
    data: SessionResponse,
  ): void {
    if (!session) {
      return;
    }

    session.set('user', {
      id: data.id,
      tenant: data.tenant,
      email: data.email,
      department: data.department ?? undefined,
      capabilities: data.capabilities,
      expiresAt: data.expiresAt,
      exp: data.exp,
    });
    session.set('token', data.token);
  }

  /**
   * Destroys the active session cookie safely, supporting both native `.delete()` and property deletion.
   *
   * @param session - Fastify secure session instance to destroy.
   *
   * @example
   * ```typescript
   * this.sessionService.clearSession(req.session);
   * ```
   */
  clearSession(session: Session<SessionData> | undefined): void {
    if (!session) {
      return;
    }

    if (typeof session.delete === 'function') {
      session.delete();
    } else {
      delete session.user;
      delete session.token;
    }
  }

  /**
   * Extracts credentials (userId and optional bearer token) stored in the active session.
   *
   * @param session - Fastify secure session instance to read from.
   * @returns Resolved `userId` and `token` if stored in the session.
   *
   * @example
   * ```typescript
   * const { userId, token } = this.sessionService.getCredentials(req.session);
   * ```
   */
  getCredentials(session: Session<SessionData> | undefined): {
    userId?: string;
    token?: string;
  } {
    if (!session) {
      return {};
    }

    const token = session.token ?? session.get?.('token');
    const userId = session.user?.id;

    return { userId, token };
  }

  /**
   * Evaluates whether a session user has expired according to its `expiresAt` or JWT `exp` claims.
   *
   * @param user - Session user to check.
   * @returns `true` if expired or undefined, `false` otherwise.
   *
   * @example
   * ```typescript
   * if (this.sessionService.isExpired(existingUser)) {
   *   this.sessionService.clearSession(req.session);
   * }
   * ```
   */
  isExpired(user: SessionUser | undefined): boolean {
    if (!user) {
      return true;
    }

    const now = Date.now();
    return (
      (typeof user.expiresAt === 'number' && user.expiresAt <= now) ||
      (typeof user.exp === 'number' && user.exp * 1000 <= now)
    );
  }
}
