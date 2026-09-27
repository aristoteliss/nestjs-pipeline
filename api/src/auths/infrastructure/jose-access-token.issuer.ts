/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { serializeCapability } from '@nestjs-pipeline/casl';
import { SignJWT } from 'jose';
import {
  type ITenantContext,
  TENANT_CONTEXT,
} from '../../common/context/tenant-context.port';
import {
  ACCESS_TOKEN_MAX_BYTES,
  ACCESS_TOKEN_TTL_SECONDS,
  JWT,
} from '../../common/environment/auth-token.config';
import {
  type AccessTokenIssueRequest,
  type AccessTokenIssueResult,
  type IAccessTokenIssuer,
} from '../application/ports/access-token-issuer.port';
import { AuthConfigurationException } from '../domain/errors/authentication.exception';

/**
 * Issues short-lived HS256 access tokens bound to a tenant and a session (`sid`).
 * Given `permissions`, it adds `perms` and `department`, unless the compact
 * token would exceed `ACCESS_TOKEN_MAX_BYTES`: then it issues the token without
 * them and that user's requests read permissions from the database.
 */
@Injectable()
export class JoseAccessTokenIssuer implements IAccessTokenIssuer {
  private readonly logger = new Logger(JoseAccessTokenIssuer.name);

  constructor(
    @Inject(TENANT_CONTEXT)
    private readonly tenantContext: ITenantContext,
  ) {}

  async issue({
    user,
    sessionId,
    permissions,
  }: AccessTokenIssueRequest): Promise<AccessTokenIssueResult> {
    const { secret, algorithms, issuer, audience } = JWT;
    if (!secret) {
      throw new AuthConfigurationException('JWT_SECRET is not configured');
    }
    if (algorithms && !algorithms.includes('HS256')) {
      throw new AuthConfigurationException(
        'JWT_ALGORITHMS must include HS256 for locally issued login tokens',
      );
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expSeconds = nowSeconds + ACCESS_TOKEN_TTL_SECONDS;
    const sign = (claims: Record<string, unknown>) => {
      const jwt = new SignJWT({
        sid: sessionId,
        tenant: this.tenantContext.schema,
        principalType: 'user',
        ...claims,
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(user.id)
        .setIssuedAt(nowSeconds)
        .setExpirationTime(expSeconds)
        .setJti(randomUUID());
      if (issuer) jwt.setIssuer(issuer);
      if (audience) jwt.setAudience(audience);
      return jwt.sign(new TextEncoder().encode(secret));
    };

    let accessToken: string | undefined;
    if (permissions) {
      // Every attribute a rule placeholder can reference; `id` comes from `sub`.
      const withPermissions = await sign({
        department: user.department ?? null,
        perms: permissions.map(serializeCapability),
      });
      if (withPermissions.length <= ACCESS_TOKEN_MAX_BYTES) {
        accessToken = withPermissions;
      } else {
        this.logger.warn(
          `Access token for user ${user.id} with ${permissions.length} rule(s) exceeds ACCESS_TOKEN_MAX_BYTES; issued without permissions.`,
        );
      }
    }

    return {
      accessToken: accessToken ?? (await sign({})),
      expiresAt: expSeconds * 1000,
    };
  }
}
