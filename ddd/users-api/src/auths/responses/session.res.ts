/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PrincipalType } from '@common/types/SessionUser';
import type { UserCapabilities } from '@nestjs-pipeline/casl';

/**
 * Response returned by `POST /auth/login`.
 *
 * `token` is the bearer token for API clients. `expiresAt`/`exp` are Unix
 * timestamps when present; `capabilities` describes the resolved authorization context.
 *
 * @example
 * `{ "id": "019...", "tenant": "acme", "email": "user@example.com", "token": "eyJ..." }`
 */
export class SessionResponse {
  id!: string;
  principalType?: PrincipalType;
  tenant!: string;
  email!: string;
  department?: string | null;
  capabilities?: UserCapabilities;
  token!: string;
  expiresAt?: number;
  exp?: number;
}
