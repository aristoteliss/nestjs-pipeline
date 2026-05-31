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
  Capability,
  CapabilityString,
  normalizeCapability,
  serializeCapability,
  type UserCapabilities,
} from '@nestjs-pipeline/casl';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { SignJWT } from 'jose';
import { GetUserQuery } from '../../users/cqrs/queries/get-user.query';
import { User } from '../../users/domain/models/user.entity';
import { EXT_USER_QUERY_REPOSITORY } from '../../users/repositories/repository.tokens';
import { GetUserCapabilitiesQuery } from '../cqrs/queries/get-user-capabilities.query';

export interface AuthResult {
  userId: string;
  userCapabilities: UserCapabilities;
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly queryBus: QueryBus,
    @Inject(EXT_USER_QUERY_REPOSITORY.getUser)
    private readonly queryRepository: IQueryRepository<GetUserQuery, User>,
  ) { }

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

    const user = await this.queryRepository.find(
      new GetUserQuery({ email }),
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async signToken(user: User): Promise<AuthResult> {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new InternalServerErrorException('JWT_SECRET is not configured');
    }

    const issuer = process.env.JWT_ISSUER;
    const audience = process.env.JWT_AUDIENCE;

    const userCapabilities = await this.queryBus.execute<
      GetUserCapabilitiesQuery,
      UserCapabilities
    >(new GetUserCapabilitiesQuery({ userId: user.id }));

    // Serialize per-user overrides into compact capability strings so they stay
    // small in the JWT. Role capabilities are intentionally NOT embedded — they
    // are resolved server-side from the `roles` claim by the role provider.
    const toCompact = (
      caps: Array<Capability | CapabilityString> | undefined,
    ): CapabilityString[] =>
      (caps ?? []).map((cap) => serializeCapability(normalizeCapability(cap)));

    const jwt = new SignJWT({
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
