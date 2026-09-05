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

import {
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  type Capability,
  type CapabilityString,
  normalizeCapability,
  serializeCapability,
  type UserCapabilities,
} from '@nestjs-pipeline/casl';
import type { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { SignJWT } from 'jose';
import { TenantSchemaContext } from '../../persistence/tenant-schema.context';
import { GetUserQuery } from '../../users/cqrs/queries/get-user.query';
import { User } from '../../users/domain/models/user.entity';
import { EXT_USER_QUERY_REPOSITORY } from '../../users/persistence/repository.tokens';
import { GetUserCapabilitiesQuery } from '../cqrs/queries/get-user-capabilities.query';

export interface AuthResult {
  userId: string;
  userCapabilities: UserCapabilities;
  accessToken: string;
}

/**
 * Application service responsible for user login verification and access token issuance.
 *
 * Encapsulates the `POST /auth/login` workflow:
 * 1. Validates the temporary login code against `AUTH_LOGIN_CODE`.
 * 2. Fetches user account details from the tenant database via {@link GetUserQuery}.
 * 3. Resolves CASL user permissions and role capabilities via {@link GetUserCapabilitiesQuery}.
 * 4. Signs an HMAC access token bound to the current tenant schema.
 *
 * @example
 * ```bash
 * # Initiating login
 * curl -X POST https://api.example.com/auth/login \
 *   -H "x-tenant-schema: tenant_a" \
 *   -H "Content-Type: application/json" \
 *   -d '{"email":"alice@example.test","code":"123456"}'
 * ```
 */
@Injectable()
export class UserLoginService {
  constructor(
    @Inject(QueryBus)
    private readonly queryBus: QueryBus,
    @Inject(EXT_USER_QUERY_REPOSITORY.getUser)
    private readonly queryRepository: IQueryRepository<GetUserQuery, User>,
    @Inject(TenantSchemaContext)
    private readonly tenantSchemaContext: TenantSchemaContext,
  ) {}

  /**
   * Verifies login credentials (email and one-time login code) against database records.
   *
   * @param email - User email address.
   * @param code - Login code provided by caller.
   * @returns The resolved {@link User} entity upon successful verification.
   * @throws {@link InternalServerErrorException} If `AUTH_LOGIN_CODE` is not configured on the server.
   * @throws {@link UnauthorizedException} If the code does not match or the user does not exist.
   *
   * @example
   * ```ts
   * const user = await loginService.authenticate('alice@example.test', '123456');
   * ```
   */
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

  /**
   * Signs and issues a JWT access token for an authenticated user.
   *
   * Embeds the active tenant schema, user identity, and compact serialized CASL capabilities
   * (overrides and denials) directly in token claims, while role-level capabilities are resolved
   * dynamically server-side from the `roles` claim.
   *
   * @param user - The authenticated domain {@link User} entity.
   * @returns An {@link AuthResult} containing userId, resolved capabilities, and the signed JWT string.
   * @throws {@link InternalServerErrorException} If `JWT_SECRET` is missing or `JWT_ALGORITHMS` excludes HS256.
   *
   * @example
   * ```ts
   * const result = await loginService.signToken(user);
   * console.log(result.accessToken);
   * ```
   */
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
    const tenant = this.tenantSchemaContext.schema;

    const userCapabilities = await this.queryBus.execute<
      GetUserCapabilitiesQuery,
      UserCapabilities
    >(new GetUserCapabilitiesQuery({ userId: user.id }));

    const toCompact = (
      caps: Array<Capability | CapabilityString> | undefined,
    ): CapabilityString[] =>
      (caps ?? []).map((cap) => serializeCapability(normalizeCapability(cap)));

    const jwt = new SignJWT({
      tenant,
      email: user.email,
      department: user.department,
      roles: userCapabilities.roles,
      additionalCapabilities: toCompact(
        userCapabilities.additionalCapabilities,
      ),
      deniedCapabilities: toCompact(userCapabilities.deniedCapabilities),
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('1h');

    if (issuer) {
      jwt.setIssuer(issuer);
    }

    if (audience) {
      jwt.setAudience(audience);
    }

    const accessToken = await jwt.sign(new TextEncoder().encode(jwtSecret));

    return {
      userId: user.id,
      userCapabilities,
      accessToken,
    };
  }
}
