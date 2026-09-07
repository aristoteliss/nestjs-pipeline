/* Copyright (C) 2026-present Aristotelis — see repository license. */
import type { UserCapabilities } from '@nestjs-pipeline/casl';
import type { User } from '../../users/domain/models/user.entity';

export const LOGIN_CODE_VERIFIER = Symbol('LOGIN_CODE_VERIFIER');
export const ACCESS_TOKEN_ISSUER = Symbol('ACCESS_TOKEN_ISSUER');

/** Application port for verifying the login credential presented by a caller. */
export interface ILoginCodeVerifier {
  verify(code: string): Promise<void> | void;
}

export interface AccessTokenIssueRequest {
  user: User;
  capabilities: UserCapabilities;
}

export interface AccessTokenIssueResult {
  accessToken: string;
  expiresAt?: number;
  exp?: number;
}

/** Application port for issuing a tenant-bound access token. */
export interface IAccessTokenIssuer {
  issue(request: AccessTokenIssueRequest): Promise<AccessTokenIssueResult>;
}
