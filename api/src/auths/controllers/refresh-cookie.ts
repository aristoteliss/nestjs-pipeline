/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Name of the cookie carrying the opaque refresh token. */
export const REFRESH_COOKIE = 'refresh_token';

/**
 * `HttpOnly` keeps the token from scripts; `SameSite=Strict` plus a body-less
 * refresh that answers only in the response body is the CSRF protection.
 */
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/auths',
} as const;

type CookieOptions = typeof REFRESH_COOKIE_OPTIONS & { expires?: Date };

/** The cookie surface of an Express response or a Fastify reply. */
export interface CookieResponse {
  cookie?(name: string, value: string, options: CookieOptions): unknown;
  setCookie?(name: string, value: string, options: CookieOptions): unknown;
  clearCookie(name: string, options: CookieOptions): unknown;
}

export interface CookieRequest {
  cookies?: Record<string, string | undefined>;
}

export function readRefreshCookie(req: CookieRequest): string | undefined {
  const value = req.cookies?.[REFRESH_COOKIE];
  return value && value.length > 0 ? value : undefined;
}

/** Sets the refresh cookie to expire with its session. */
export function setRefreshCookie(
  res: CookieResponse,
  token: string,
  expiresAt: number,
): void {
  const options = { ...REFRESH_COOKIE_OPTIONS, expires: new Date(expiresAt) };
  if (typeof res.setCookie === 'function') {
    res.setCookie(REFRESH_COOKIE, token, options);
  } else {
    res.cookie?.(REFRESH_COOKIE, token, options);
  }
}

export function clearRefreshCookie(res: CookieResponse): void {
  res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS);
}
