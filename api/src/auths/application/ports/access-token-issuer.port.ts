/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Capability } from '@nestjs-pipeline/casl';
import type { User } from '../../../users/domain/models/user.entity';

export const ACCESS_TOKEN_ISSUER = Symbol('ACCESS_TOKEN_ISSUER');

export interface AccessTokenIssueRequest {
  user: User;
  sessionId: string;
  /** Omitted: requests read the rules from persistence. `[]`: the user has no rules. */
  permissions?: readonly Capability[];
}

export interface AccessTokenIssueResult {
  accessToken: string;
  /** Expiry as a Unix timestamp in milliseconds. */
  expiresAt: number;
}

/**
 * Signs the short-lived access token of a login or refresh, bound to the
 * current tenant and to the `Auth` session. Verification is stateless, so a
 * token stays valid until it expires even after its session is revoked.
 */
export interface IAccessTokenIssuer {
  issue(request: AccessTokenIssueRequest): Promise<AccessTokenIssueResult>;
}
