/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
   * Saves the access token and `{ id, principalType, tenant, exp }` into the Fastify session cookie.
   *
   * @param session - Active Fastify secure session instance, if present on the request.
   * @param data - Login or refresh response carrying the access token.
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
    sid?: string,
  ): void {
    if (!session) {
      return;
    }

    session.set('user', {
      id: data.id,
      principalType: data.principalType,
      tenant: data.tenant,
      ...(sid ? { sid } : {}),
      exp: Math.floor(data.accessTokenExpiresAt / 1000),
    });
    session.set('token', data.accessToken);
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
