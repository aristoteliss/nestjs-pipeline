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

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  type Capability,
  type CapabilityString,
  normalizeCapability,
  serializeCapability,
  type UserCapabilities,
} from '@nestjs-pipeline/casl';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { importSPKI, jwtVerify } from 'jose';
import type { SessionUser } from '../../common/types/SessionUser';

/**
 * Verifies Bearer JSON Web Tokens presented in the `Authorization` request header.
 *
 * Supports both symmetric HMAC secrets (`JWT_SECRET`) and asymmetric RSA/ECDSA public keys (`JWT_PUBLIC_KEY`).
 * Public SPKI keys are parsed and memoized as WebCrypto `CryptoKey` objects on first use to avoid repeated ASN.1
 * parsing on every HTTP request. Token claims (`sub`, `tenant`, `roles`, `additionalCapabilities`,
 * `deniedCapabilities`) are validated and converted into a compacted {@link SessionUser} structure.
 *
 * @example
 * ```bash
 * # Request with Bearer token
 * curl https://api.example.com/users \
 *   -H "x-tenant-schema: tenant_a" \
 *   -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 * ```
 *
 * @example
 * ```env
 * # Environment configuration (.env)
 * JWT_SECRET="super-secret-symmetric-key-at-least-32-chars"
 * JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...\n-----END PUBLIC KEY-----"
 * JWT_PUBLIC_KEY_ALG="RS256"
 * JWT_ISSUER="users-api"
 * JWT_AUDIENCE="nestjs-pipeline"
 * ```
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

  /**
   * Parses and validates a Bearer JWT from the `Authorization` header.
   *
   * Scheme matching is case-insensitive (accepts both `Bearer <token>` and `bearer <token>`).
   *
   * @param req - Request object containing incoming HTTP headers.
   * @returns The authenticated {@link SessionUser} if the token is valid, or `undefined` if no Bearer token was provided.
   * @throws {@link UnauthorizedException} If the token is empty, expired, has an invalid signature,
   *         misses required claims, targets a different tenant, or if no server-side keys are configured.
   *
   * @example
   * ```ts
   * const principal = await jwtAuthenticator.authenticate({
   *   headers: { authorization: 'Bearer eyJhbGci...' },
   * });
   * // returns: { id: 'usr_123', tenant: 'tenant_a', email: 'alice@example.com', capabilities: { roles: ['admin'] } }
   * ```
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

      if (payload.tenant !== TenantSchemaContext.currentSchema) {
        throw new UnauthorizedException(
          'Credential tenant does not match the selected tenant',
        );
      }

      const user: SessionUser = {
        id: payload.sub,
        tenant: payload.tenant,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        department:
          typeof payload.department === 'string'
            ? payload.department
            : undefined,
        capabilities: this.compactUserCapabilities({
          roles: Array.isArray(payload.roles) ? payload.roles : undefined,
          additionalCapabilities: Array.isArray(payload.additionalCapabilities)
            ? payload.additionalCapabilities
            : undefined,
          deniedCapabilities: Array.isArray(payload.deniedCapabilities)
            ? payload.deniedCapabilities
            : undefined,
        }),
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

  /**
   * Imports an SPKI PEM-encoded public key into a WebCrypto `CryptoKey`.
   * Isolated as a protected method for unit testability and caching verification.
   */
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

  private compactUserCapabilities(
    input: unknown,
  ): UserCapabilities | undefined {
    if (!input || typeof input !== 'object') return undefined;

    const raw = input as {
      roles?: string[] | unknown;
      additionalCapabilities?: Array<Capability | CapabilityString | unknown>;
      deniedCapabilities?: Array<Capability | CapabilityString | unknown>;
    };

    const roles = Array.isArray(raw.roles)
      ? raw.roles.filter((r): r is string => typeof r === 'string')
      : [];

    const additionalCapabilities = this.toCompactCapabilitiesArray(
      raw.additionalCapabilities,
    );
    const deniedCapabilities = this.toCompactCapabilitiesArray(
      raw.deniedCapabilities,
    );

    if (roles.length === 0 && !additionalCapabilities && !deniedCapabilities) {
      return undefined;
    }

    return {
      roles,
      additionalCapabilities,
      deniedCapabilities,
    };
  }

  private toCompactCapabilitiesArray(
    input: unknown,
  ): CapabilityString[] | undefined {
    if (!Array.isArray(input)) return undefined;

    const compact = input
      .map((cap) => {
        if (typeof cap === 'string' || (cap && typeof cap === 'object')) {
          return serializeCapability(
            normalizeCapability(cap as Capability | CapabilityString),
          );
        }
        throw new TypeError(
          'Capabilities must be compact strings or capability objects.',
        );
      })
      .filter((cap): cap is CapabilityString => typeof cap === 'string');

    return compact.length > 0 ? compact : undefined;
  }
}
