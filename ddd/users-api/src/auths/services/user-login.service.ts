/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { randomUUID } from 'node:crypto';
import {
  type ITenantContext,
  TENANT_CONTEXT,
} from '@common/context/tenant-context.port';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type { UserCapabilities } from '@nestjs-pipeline/casl';
import type { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { SignJWT } from 'jose';
import { GetUserQuery } from '../../users/cqrs/queries/get-user.query';
import { User } from '../../users/domain/models/user.entity';
import { EXT_USER_QUERY_REPOSITORY } from '../../users/persistence/repository.tokens';
import { GetUserCapabilitiesQuery } from '../cqrs/queries/get-user-capabilities.query';
import { CapabilityCodec } from './capability-codec';

export interface AuthResult {
  userId: string;
  userCapabilities: UserCapabilities;
  accessToken: string;
  expiresAt?: number;
  exp?: number;
}

/**
 * Application service responsible for user login verification and access token issuance.
 *
 * Tenant identity is consumed through the application-facing {@link ITenantContext}
 * port. The concrete AsyncLocalStorage/schema implementation remains an
 * infrastructure concern bound by `PersistenceModule`.
 *
 * Encapsulates the `POST /auth/login` workflow:
 * 1. Validates the temporary login code against `AUTH_LOGIN_CODE`.
 * 2. Fetches user account details from the tenant database via {@link GetUserQuery}.
 * 3. Resolves CASL user permissions and role capabilities via {@link GetUserCapabilitiesQuery}.
 * 4. Signs an HMAC access token bound to the current tenant schema.
 */
@Injectable()
export class UserLoginService {
  constructor(
    @Inject(QueryBus)
    private readonly queryBus: QueryBus,
    @Inject(EXT_USER_QUERY_REPOSITORY.getUser)
    private readonly queryRepository: IQueryRepository<GetUserQuery, User>,
    @Inject(TENANT_CONTEXT)
    private readonly tenantContext: ITenantContext,
  ) {}

  /** Verifies login credentials against the configured login code and tenant user repository. */
  async authenticate(email: string, code: string): Promise<User> {
    const expectedCode = process.env.AUTH_LOGIN_CODE;
    if (!expectedCode) {
      throw new InternalServerErrorException(
        'AUTH_LOGIN_CODE is not configured',
      );
    }

    if (code !== expectedCode) {
      throw new UnauthorizedException('Invalid code');
    }

    const user = await this.queryRepository.find(new GetUserQuery({ email }));

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  /** Signs and issues a JWT access token for an authenticated user. */
  async signToken(user: User): Promise<AuthResult> {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new InternalServerErrorException('JWT_SECRET is not configured');
    }
    const configuredAlgorithms = process.env.JWT_ALGORITHMS?.split(',').map(
      (algorithm) => algorithm.trim(),
    );
    if (configuredAlgorithms && !configuredAlgorithms.includes('HS256')) {
      throw new InternalServerErrorException(
        'JWT_ALGORITHMS must include HS256 for locally issued login tokens',
      );
    }

    const issuer = process.env.JWT_ISSUER;
    const audience = process.env.JWT_AUDIENCE;
    const tenant = this.tenantContext.schema;

    const userCapabilities = await this.queryBus.execute<
      GetUserCapabilitiesQuery,
      UserCapabilities
    >(new GetUserCapabilitiesQuery({ userId: user.id }));

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expSeconds = nowSeconds + 3600;

    const jwt = new SignJWT({
      tenant,
      email: user.email,
      department: user.department,
      roles: userCapabilities.roles,
      additionalCapabilities: CapabilityCodec.toCompact(
        userCapabilities.additionalCapabilities,
      ),
      deniedCapabilities: CapabilityCodec.toCompact(
        userCapabilities.deniedCapabilities,
      ),
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(expSeconds)
      .setJti(randomUUID());

    if (issuer) jwt.setIssuer(issuer);
    if (audience) jwt.setAudience(audience);

    const accessToken = await jwt.sign(new TextEncoder().encode(jwtSecret));

    return {
      userId: user.id,
      userCapabilities,
      accessToken,
      expiresAt: expSeconds * 1000,
      exp: expSeconds,
    };
  }
}
