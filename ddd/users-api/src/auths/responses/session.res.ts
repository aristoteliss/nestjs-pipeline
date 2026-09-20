/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PrincipalType } from '@common/types/SessionUser';

/**
 * Response of `POST /auths/login` and `POST /auths/refresh`.
 *
 * `accessToken` is a short-lived bearer token; `accessTokenExpiresAt` is its
 * expiry as a Unix timestamp in milliseconds. The refresh token is never in the
 * body; it travels only in the `HttpOnly` `refresh_token` cookie.
 *
 * @example
 * `{ "id": "019...", "tenant": "acme", "email": "user@example.com", "accessToken": "eyJ...", "accessTokenExpiresAt": 1741258800000 }`
 */
export class SessionResponse {
  id!: string;
  principalType!: PrincipalType;
  tenant!: string;
  email!: string;
  department?: string | null;
  accessToken!: string;
  accessTokenExpiresAt!: number;
}
