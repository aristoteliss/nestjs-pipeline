/* Copyright (C) 2026-present Aristotelis — see repository license. */

export const AUTH_TOKEN_POLICY = Symbol('AUTH_TOKEN_POLICY');

/**
 * Session settings the handlers apply, bound at startup from
 * `auth-token.config.ts`, so application code never reads the environment.
 */
export interface AuthTokenPolicy {
  readonly refreshTokenTtlSeconds: number;
  readonly refreshReuseGraceSeconds: number;
  readonly embedPermissions: boolean;
}
