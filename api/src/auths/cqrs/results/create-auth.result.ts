/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PrincipalType } from '@common/types/SessionUser';
import type { Auth } from '../../domain/models/auth.entity';

/**
 * Application result of login and refresh.
 *
 * `refreshToken` is the raw token, present only when a new one was issued; the
 * presentation layer puts it in an `HttpOnly` cookie and never in a body.
 */
export interface CreateAuthResult {
  readonly aggregate: Auth;
  readonly id: string;
  readonly principalType: PrincipalType;
  readonly tenant: string;
  readonly email: string;
  readonly department?: string | null;
  readonly accessToken: string;
  /** Access-token expiry as a Unix timestamp in milliseconds. */
  readonly accessTokenExpiresAt: number;
  readonly refreshToken?: string;
  /** Session expiry as a Unix timestamp in milliseconds. */
  readonly sessionExpiresAt: number;
}
