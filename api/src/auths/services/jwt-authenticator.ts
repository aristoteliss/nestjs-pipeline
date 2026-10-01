/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { requireTenant } from '@cqrs-ddd/core/application';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { type Capability, parseCapabilityString } from '@nestjs-pipeline/casl';
import { errors, importSPKI, jwtVerify } from 'jose';
import {
  JWT,
  PERMISSIONS_IN_ACCESS_TOKEN,
} from '../../common/environment/auth-token.config.js';
import type { SessionPrincipal } from '../../common/types/session-principal.js';
import { firstHeaderValue } from './helpers/first-header-value.js';

type VerificationKey = {
  key: Uint8Array | CryptoKey;
  defaultAlgorithm: string;
  symmetric: boolean;
};

/**
 * Verifies Bearer JSON Web Tokens presented in the `Authorization` request header.
 *
 * Supports both symmetric HMAC secrets (`JWT_SECRET`) and asymmetric RSA/ECDSA public keys (`JWT_PUBLIC_KEY`).
 * Public SPKI keys are parsed and memoized as WebCrypto `CryptoKey` objects on first use to avoid repeated ASN.1
 * parsing on every HTTP request. Verification is stateless: signature, `exp`, issuer and audience
 * are checked and `sub`, `tenant` and `sid` are mapped, with no per-request session lookup, so a
 * logged-out access token stays valid until it expires. Only with `PERMISSIONS_IN_ACCESS_TOKEN=true`
 * are the token's `perms` parsed into `grants` (a malformed entry is a 401) and `department` mapped;
 * otherwise both claims are ignored, so turning the flag off takes effect for tokens already issued.
 * Successful Bearer authentication explicitly marks the principal as `user`; authorization never infers
 * human identity from the syntax of the JWT subject.
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
  private readonly logger = new Logger(JwtAuthenticator.name);
  private keys?: Promise<VerificationKey[]>;

  /**
   * Verifies an `Authorization: Bearer <token>` header: signature, `exp`, issuer,
   * audience, and a `tenant` claim equal to the request's tenant. Only `Bearer`
   * and `bearer` are recognized as the scheme.
   *
   * @param req - Request with its headers.
   * @returns The `user` principal with `sid` and `expiresAt` (milliseconds),
   *   plus `grants` and `department` when the token carries
   *   permissions and `PERMISSIONS_IN_ACCESS_TOKEN` is on; `undefined` when there
   *   is no Bearer header.
   * @throws UnauthorizedException for an empty, expired, badly signed or
   *   foreign-tenant token, a missing `sub`, `tenant`, `sid` or `exp` claim, a
   *   non-user `principalType`, malformed `perms`, or when no verification key is
   *   configured.
   *
   * @example
   * ```ts
   * const principal = await this.jwtAuthenticator.authenticate({
   *   headers: { authorization: `Bearer ${accessToken}` },
   * });
   * ```
   */
  async authenticate(req: {
    headers?: Record<string, string | string[] | undefined>;
  }): Promise<SessionPrincipal | undefined> {
    const authHeader = firstHeaderValue(req.headers?.authorization);
    if (!authHeader) return undefined;

    const match = authHeader.match(/^[Bb]earer\s+(.+)$/);
    if (!match) return undefined;

    const token = match[1].trim();
    if (token.length === 0) {
      throw new UnauthorizedException('Bearer token is empty');
    }

    this.keys ??= this.importKeys();
    const candidates = await this.keys;
    if (candidates.length === 0) {
      this.logger.warn(
        'Bearer token received, but no JWT verification keys (JWT_SECRET or JWT_PUBLIC_KEY) are configured.',
      );
      throw new UnauthorizedException('JWT authentication is not configured');
    }

    const { issuer, audience, algorithms: configuredAlgorithms } = JWT;

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
            requiredClaims: ['exp'],
          }));
          break;
        } catch (error) {
          if (
            error instanceof errors.JWTClaimValidationFailed &&
            error.claim === 'exp'
          ) {
            throw new UnauthorizedException(
              'Token is missing its expiration claim',
            );
          }
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
      if (typeof payload.sid !== 'string' || payload.sid.trim().length === 0) {
        throw new UnauthorizedException(
          'Token is missing its session identifier claim',
        );
      }
      if (typeof payload.exp !== 'number') {
        throw new UnauthorizedException(
          'Token is missing its expiration claim',
        );
      }

      if (
        payload.principalType !== undefined &&
        payload.principalType !== 'user'
      ) {
        throw new UnauthorizedException(
          'Token principal type is not a user principal',
        );
      }

      if (payload.tenant !== requireTenant('the credential tenant check')) {
        throw new UnauthorizedException(
          'Credential tenant does not match the selected tenant',
        );
      }

      const user: SessionPrincipal = {
        id: payload.sub,
        type: 'user',
        tenant: payload.tenant,
        sid: payload.sid,
        ...(PERMISSIONS_IN_ACCESS_TOKEN && payload.perms !== undefined
          ? {
              grants: parsePermissions(payload.perms),
              department:
                typeof payload.department === 'string'
                  ? payload.department
                  : null,
            }
          : {}),
        expiresAt: payload.exp * 1000,
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

  private async importKeys(): Promise<VerificationKey[]> {
    const keys: VerificationKey[] = [];
    if (JWT.publicKey) {
      try {
        keys.push({
          key: await importSPKI(JWT.publicKey, JWT.publicKeyAlg),
          defaultAlgorithm: JWT.publicKeyAlg,
          symmetric: false,
        });
      } catch {
        this.logger.warn(
          'JWT_PUBLIC_KEY is set but not a valid SPKI key; public-key verification is disabled.',
        );
      }
    }
    if (JWT.secret) {
      keys.push({
        key: new TextEncoder().encode(JWT.secret),
        defaultAlgorithm: 'HS256',
        symmetric: true,
      });
    }
    return keys;
  }
}

function parsePermissions(perms: unknown): Capability[] {
  if (
    !Array.isArray(perms) ||
    perms.some((entry) => typeof entry !== 'string')
  ) {
    throw new UnauthorizedException('Token permissions are malformed');
  }
  try {
    return perms.map((entry: string) => parseCapabilityString(entry));
  } catch {
    throw new UnauthorizedException('Token permissions are malformed');
  }
}
