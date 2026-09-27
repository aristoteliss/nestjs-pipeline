/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { httpExchangeStore } from '@common/context/http-exchange.store';
import type { Session } from '@fastify/secure-session';
import { Injectable } from '@nestjs/common';
import type { SessionData, SessionUser } from '../../common/types/SessionUser';
import type { ISessionCookies } from '../application/ports/session-cookies.port';
import type { AuthResult } from '../application/cqrs/results/auth.result';

export const REFRESH_COOKIE = 'refresh_token';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/auths',
} as const;

type CookieOptions = typeof REFRESH_COOKIE_OPTIONS & { expires?: Date };

type ClearCookie = (name: string, options: CookieOptions) => unknown;

type CookieResponse =
  | {
      setCookie(name: string, value: string, options: CookieOptions): unknown;
      clearCookie: ClearCookie;
    }
  | {
      cookie(name: string, value: string, options: CookieOptions): unknown;
      clearCookie: ClearCookie;
    };

@Injectable()
export class SessionService implements ISessionCookies {
  /**
   * Writes the cookies of a login or refresh on the current HTTP request, taken
   * from `httpExchangeStore`; outside an HTTP request it does nothing.
   *
   * - A new refresh token goes into the `refresh_token` cookie: `HttpOnly`,
   *   `Secure`, `SameSite=Strict`, sent only to `/auths`, and expiring with the
   *   session. Refresh returns the access token only in its body, so
   *   `SameSite=Strict` is what protects it from CSRF. A grace-window refresh
   *   carries no new token and leaves the cookie as it is.
   * - On Fastify, the access token and the principal
   *   `{ id, principalType, tenant, sid, exp }` go into the secure-session
   *   cookie, so the browser authenticates without a Bearer header.
   *
   * @param result - Result of `CreateAuthCommand` or `RefreshAuthCommand`.
   *
   * @example
   * ```ts
   * // CreateAuthHandler, through the SESSION_COOKIES port
   * this.cookies.save(result);
   * return result;
   * ```
   */
  save(result: AuthResult): void {
    const exchange = httpExchangeStore.getStore();
    if (!exchange) return;

    if (result.refreshToken) {
      const res = exchange.response as CookieResponse;
      const options = {
        ...REFRESH_COOKIE_OPTIONS,
        expires: new Date(result.sessionExpiresAt),
      };
      if ('setCookie' in res) {
        res.setCookie(REFRESH_COOKIE, result.refreshToken, options);
      } else {
        res.cookie(REFRESH_COOKIE, result.refreshToken, options);
      }
    }

    exchange.session?.set('user', {
      id: result.userId,
      principalType: result.principalType,
      tenant: result.tenant,
      sid: result.aggregate.id,
      exp: Math.floor(result.accessTokenExpiresAt / 1000),
    });
    exchange.session?.set('token', result.accessToken);
  }

  /**
   * Deletes the secure-session cookie and the `refresh_token` cookie of the
   * current HTTP request, clearing the refresh cookie under the path it was set
   * with; outside an HTTP request it does nothing.
   *
   * @example
   * ```ts
   * // RevokeAuthHandler, through the SESSION_COOKIES port
   * this.cookies.clear();
   * ```
   */
  clear(): void {
    const exchange = httpExchangeStore.getStore();
    if (!exchange) return;

    exchange.session?.delete();
    (exchange.response as CookieResponse).clearCookie(
      REFRESH_COOKIE,
      REFRESH_COOKIE_OPTIONS,
    );
  }

  /**
   * Deletes a secure-session cookie that can no longer authenticate. It takes
   * the session explicitly because principal resolution runs in a guard, before
   * `httpExchangeStore` is set up.
   *
   * @param session - `req.session`; `undefined` on Express.
   *
   * @example
   * ```ts
   * if (this.sessionService.isExpired(req.session?.user)) {
   *   this.sessionService.discard(req.session);
   * }
   * ```
   */
  discard(session: Session<SessionData> | undefined): void {
    session?.delete();
  }

  /**
   * Whether a principal read back from the session cookie has expired, by its
   * `expiresAt` (milliseconds) or `exp` (seconds). A missing principal counts as
   * expired; a principal with neither field never expires.
   *
   * @param user - `req.session?.user`.
   *
   * @example
   * ```ts
   * if (this.sessionService.isExpired(req.session?.user)) {
   *   this.sessionService.discard(req.session);
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
