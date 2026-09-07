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
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import type { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { importSPKI, jwtVerify } from 'jose';
import type { SessionUser } from '../../common/types/SessionUser';
import { FindAuthQuery } from '../cqrs/queries/find-auth.query';
import type { Auth } from '../domain/models/auth.entity';
import { QUERY_REPOSITORY } from '../persistence/repository.tokens';
import { CapabilityCodec } from './capability-codec';

/**
 * Verifies Bearer JSON Web Tokens presented in the `Authorization` request header.
 *
 * Supports both symmetric HMAC secrets (`JWT_SECRET`) and asymmetric RSA/ECDSA public keys (`JWT_PUBLIC_KEY`).
 * Public SPKI keys are parsed and memoized as WebCrypto `CryptoKey` objects on first use to avoid repeated ASN.1
 * parsing on every HTTP request. Token claims (`sub`, `tenant`, `roles`, `additionalCapabilities`,
 * `deniedCapabilities`) are validated and converted into a compacted {@link SessionUser} structure.
 * Successful Bearer authentication explicitly marks the principal as `user`; authorization never infers
 * human identity from the syntax of the JWT subject.
 */
@Injectable()
export class JwtAuthenticator {
  private readonly encoder = new TextEncoder();
  private readonly logger = new Logger(JwtAuthenticator.name);

  private cachedCandidates?: Array<{
    key: Uint8Array | CryptoKey;
    defaultAlgorithm: string;
    symmetric: boolean;
  }>;
  private cachedPublicKeyRaw?: string;
  private cachedPublicKeyAlg?: string;
  private cachedSecretRaw?: string;

  constructor(
    private readonly tenantSchemaContext: TenantSchemaContext,
    @Optional()
    @Inject(QUERY_REPOSITORY.findAuth)
    private readonly authQueryRepository?: IQueryRepository<
      FindAuthQuery,
      Auth | null
    >,
  ) {}

  /**
   * Parses and validates a Bearer JWT from the `Authorization` header.
   *
   * @returns The authenticated {@link SessionUser} with `principalType: 'user'`,
   *          or `undefined` if no Bearer token was provided.
   */
  async authenticate(req: {
    headers?: Record<string, string | string[] | undefined>;
  }): Promise<SessionUser | undefined> {
    const authHeader = this.firstHeaderValue(req.headers?.authorization);
    if (!authHeader) return undefined;

    const match = authHeader.match(/^[Bb]earer\s+(.+)$/);
    if (!match) return undefined;

    const token = match[1].trim();
    if (token.length === 0) {
      throw new UnauthorizedException('Bearer token is empty');
    }

    const candidates = await this.getJwtVerificationCandidates();
    if (candidates.length === 0) {
      this.logger.warn(
        'Bearer token received, but no JWT verification keys (JWT_SECRET or JWT_PUBLIC_KEY) are configured.',
      );
      throw new UnauthorizedException('JWT authentication is not configured');
    }

    const issuer = process.env.JWT_ISSUER;
    const audience = process.env.JWT_AUDIENCE;
    const configuredAlgorithms = process.env.JWT_ALGORITHMS?.split(',')
      .map((algorithm) => algorithm.trim())
      .filter(Boolean);

    try {
      let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'] | undefined;
      let lastError: unknown;

      for (const candidate of candidates) {
        const algorithms = configuredAlgorithms
          ? configuredAlgorithms.filter((algorithm) =>
              candidate.symmetric
                ? algorithm.startsWith('HS')
                : !algorithm.startsWith('HS'),
            )
          : [candidate.defaultAlgorithm];
        if (algorithms.length === 0) continue;

        try {
          ({ payload } = await jwtVerify(token, candidate.key, {
            algorithms,
            issuer,
            audience,
          }));
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!payload) {
        throw lastError ?? new Error('No JWT verification algorithm matched');
      }

      if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
        throw new UnauthorizedException('Token is missing its subject claim');
      }
      if (typeof payload.tenant !== 'string') {
        throw new UnauthorizedException('Token is missing its tenant claim');
      }

      if (payload.tenant !== this.tenantSchemaContext.schema) {
        throw new UnauthorizedException(
          'Credential tenant does not match the selected tenant',
        );
      }

      if (this.authQueryRepository) {
        const activeAuth = await this.authQueryRepository.find(
          new FindAuthQuery({ userId: payload.sub, token }),
        );
        if (!activeAuth) {
          throw new UnauthorizedException(
            'Token has been revoked or session has ended',
          );
        }
      }

      const user: SessionUser = {
        id: payload.sub,
        principalType: 'user',
        tenant: payload.tenant,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        department:
          typeof payload.department === 'string'
            ? payload.department
            : undefined,
        expiresAt:
          typeof payload.exp === 'number' ? payload.exp * 1000 : undefined,
        exp: typeof payload.exp === 'number' ? payload.exp : undefined,
        capabilities: CapabilityCodec.compactUserCapabilities(payload),
      };

      this.logger.debug(`Authenticated user ${user.id} from Bearer token`);
      return user;
    } catch (e: unknown) {
      if (e instanceof UnauthorizedException) throw e;
      this.logger.warn(
        `Failed to verify JWT from Authorization header: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  protected async importPublicKey(
    spki: string,
    alg: string,
  ): Promise<Uint8Array | CryptoKey> {
    return importSPKI(spki, alg);
  }

  private async getJwtVerificationCandidates() {
    const publicKey = process.env.JWT_PUBLIC_KEY;
    const publicKeyAlg = process.env.JWT_PUBLIC_KEY_ALG ?? 'RS256';
    const secret = process.env.JWT_SECRET;

    if (
      this.cachedCandidates &&
      this.cachedPublicKeyRaw === publicKey &&
      this.cachedPublicKeyAlg === publicKeyAlg &&
      this.cachedSecretRaw === secret
    ) {
      return this.cachedCandidates;
    }

    const candidates: Array<{
      key: Uint8Array | CryptoKey;
      defaultAlgorithm: string;
      symmetric: boolean;
    }> = [];

    if (publicKey) {
      const normalizedKey = publicKey.replace(/\\n/g, '\n');
      try {
        candidates.push({
          key: await this.importPublicKey(normalizedKey, publicKeyAlg),
          defaultAlgorithm: publicKeyAlg,
          symmetric: false,
        });
      } catch (_e: unknown) {
        this.logger.warn(
          'JWT_PUBLIC_KEY is set but not a valid SPKI key; public-key verification is disabled.',
        );
      }
    }

    if (secret) {
      candidates.push({
        key: this.encoder.encode(secret),
        defaultAlgorithm: 'HS256',
        symmetric: true,
      });
    }

    this.cachedCandidates = candidates;
    this.cachedPublicKeyRaw = publicKey;
    this.cachedPublicKeyAlg = publicKeyAlg;
    this.cachedSecretRaw = secret;

    return candidates;
  }

  private firstHeaderValue(
    value: string | string[] | undefined,
  ): string | undefined {
    const single = Array.isArray(value) ? value[0] : value;
    return typeof single === 'string' && single.length > 0 ? single : undefined;
  }
}
