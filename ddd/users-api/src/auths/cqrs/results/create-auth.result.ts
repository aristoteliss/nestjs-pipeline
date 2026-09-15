/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PrincipalType } from '@common/types/SessionUser';
import type { UserCapabilities } from '@nestjs-pipeline/casl';
import type { Auth } from '../../domain/models/auth.entity';

/**
 * Application result produced by {@link CreateAuthHandler}.
 *
 * Carries the newly persisted {@link Auth} aggregate root along with
 * authenticated identity and capability metadata needed by downstream callers.
 */
export interface CreateAuthResult {
  readonly aggregate: Auth;
  readonly id: string;
  readonly principalType?: PrincipalType;
  readonly tenant: string;
  readonly email: string;
  readonly department?: string | null;
  readonly capabilities?: UserCapabilities;
  readonly token: string;
  readonly expiresAt?: number;
  readonly exp?: number;
}
