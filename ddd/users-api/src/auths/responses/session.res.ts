/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PrincipalType } from '@common/types/SessionUser';
import type { UserCapabilities } from '@nestjs-pipeline/casl';

/**
 * HTTP response DTO returned by `POST /auth/login`.
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
