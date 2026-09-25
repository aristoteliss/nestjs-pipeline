/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Capability } from '@nestjs-pipeline/casl';
import type { User } from '../../users/domain/models/user.entity';
import type { Auth } from '../domain/models/auth.entity';

export const LOGIN_CODE_VERIFIER = Symbol('LOGIN_CODE_VERIFIER');
export const ACCESS_TOKEN_ISSUER = Symbol('ACCESS_TOKEN_ISSUER');
export const REFRESH_TOKENS = Symbol('REFRESH_TOKENS');
export const AUTH_TOKEN_POLICY = Symbol('AUTH_TOKEN_POLICY');
export const AUTH_SESSIONS = Symbol('AUTH_SESSIONS');

export interface LoginCredentialVerification {
  userId: string;
  code: string;
}

/** Application port for verifying the login credential presented by a caller. */
export interface ILoginCodeVerifier {
  verify(credentials: LoginCredentialVerification): Promise<void> | void;
}

export interface AccessTokenIssueRequest {
  user: User;
  /** The session (`Auth` id) the token belongs to, carried as `sid`. */
  sessionId: string;
  /** The user's ordered rules to copy into the token (`perms`, with `department`). */
  permissions?: readonly Capability[];
}

export interface AccessTokenIssueResult {
  accessToken: string;
  /** Expiry as a Unix timestamp in milliseconds. */
  expiresAt: number;
}

/** Application port for issuing a short-lived, tenant-bound access token. */
export interface IAccessTokenIssuer {
  issue(request: AccessTokenIssueRequest): Promise<AccessTokenIssueResult>;
}

/** Application port for opaque refresh tokens; only their hashes are stored. */
export interface IRefreshTokens {
  generate(): string;
  hash(token: string): string;
}

/** Session timing the application enforces. */
export interface AuthTokenPolicy {
  readonly refreshTokenTtlSeconds: number;
  readonly refreshReuseGraceSeconds: number;
  /** Copy the user's rules into each access token. */
  readonly permissionsInAccessToken: boolean;
}

/** Application port for locating sessions by refresh-token hash. */
export interface IAuthSessions {
  /** The session whose current or immediately previous token has this hash, read from primary storage. */
  findByTokenHash(hash: string): Promise<Auth | null>;
  /** The session that rotated away from this hash earlier, read from primary storage. */
  findByConsumedTokenHash(hash: string): Promise<Auth | null>;
  /** Records a rotated-away hash; recording the same hash twice is a no-op. */
  recordConsumed(
    hash: string,
    authId: string,
    consumedAt: number,
  ): Promise<void>;
}
