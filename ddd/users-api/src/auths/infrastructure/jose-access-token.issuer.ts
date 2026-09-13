/*
 * Copyright (C) 2026-present Aristotelis
 * See repository license for full terms.
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SignJWT } from 'jose';
import {
  type ITenantContext,
  TENANT_CONTEXT,
} from '../../common/context/tenant-context.port';
import type {
  AccessTokenIssueRequest,
  AccessTokenIssueResult,
  IAccessTokenIssuer,
} from '../application/authentication.ports';
import { AuthConfigurationException } from '../domain/errors/authentication.exception';
import { CapabilityCodec } from '../services/capability-codec';

/** Infrastructure adapter responsible for locally issued HMAC JWT access tokens. */
@Injectable()
export class JoseAccessTokenIssuer implements IAccessTokenIssuer {
  constructor(
    @Inject(TENANT_CONTEXT)
    private readonly tenantContext: ITenantContext,
  ) {}

  async issue({
    user,
    capabilities,
  }: AccessTokenIssueRequest): Promise<AccessTokenIssueResult> {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new AuthConfigurationException('JWT_SECRET is not configured');
    }

    const configuredAlgorithms = process.env.JWT_ALGORITHMS?.split(',').map(
      (algorithm) => algorithm.trim(),
    );
    if (configuredAlgorithms && !configuredAlgorithms.includes('HS256')) {
      throw new AuthConfigurationException(
        'JWT_ALGORITHMS must include HS256 for locally issued login tokens',
      );
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expSeconds = nowSeconds + 3600;
    const jwt = new SignJWT({
      tenant: this.tenantContext.schema,
      email: user.email,
      department: user.department,
      roles: capabilities.roles,
      additionalCapabilities: CapabilityCodec.toCompact(
        capabilities.additionalCapabilities,
      ),
      deniedCapabilities: CapabilityCodec.toCompact(
        capabilities.deniedCapabilities,
      ),
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(expSeconds)
      .setJti(randomUUID());

    if (process.env.JWT_ISSUER) jwt.setIssuer(process.env.JWT_ISSUER);
    if (process.env.JWT_AUDIENCE) jwt.setAudience(process.env.JWT_AUDIENCE);

    return {
      accessToken: await jwt.sign(new TextEncoder().encode(jwtSecret)),
      expiresAt: expSeconds * 1000,
      exp: expSeconds,
    };
  }
}
