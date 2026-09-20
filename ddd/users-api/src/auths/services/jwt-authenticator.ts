/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { type Capability, parseCapabilityString } from '@nestjs-pipeline/casl';
import { importSPKI, jwtVerify } from 'jose';
import {
  type ITenantContext,
  TENANT_CONTEXT,
} from '../../common/context/tenant-context.port';
import { PERMISSIONS_IN_ACCESS_TOKEN } from '../../common/environment/auth-token.config';
import type { SessionUser } from '../../common/types/SessionUser';

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
    @Inject(TENANT_CONTEXT)
    private readonly tenantContext: ITenantContext,
  ) {}

  /**
   * Parses and validates a Bearer JWT from the `Authorization` header.
   *
   * Scheme matching is case-insensitive (accepts both `Bearer <token>` and `bearer <token>`).
   *
   * @param req - Request object containing incoming HTTP headers.
   * @returns The authenticated {@link SessionUser} with `principalType: 'user'` if the token is valid,
   *          or `undefined` if no Bearer token was provided.
   * @throws {@link UnauthorizedException} If the token is empty, expired, has an invalid signature,
   *         misses required claims, targets a different tenant, or if no server-side keys are configured.
   *
   * @example
   * ```ts
   * const principal = await jwtAuthenticator.authenticate({
   *   headers: { authorization: 'Bearer eyJhbGci...' },
   * });
   * // returns: { id: 'usr_123', principalType: 'user', tenant: 'tenant_a', sid: '019...', exp: 1741258800 }
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

      if (
        payload.principalType !== undefined &&
        payload.principalType !== 'user'
      ) {
        throw new UnauthorizedException(
          'Token principal type is not a user principal',
        );
      }

      if (payload.tenant !== this.tenantContext.schema) {
        throw new UnauthorizedException(
          'Credential tenant does not match the selected tenant',
        );
      }

      const user: SessionUser = {
        id: payload.sub,
        principalType: 'user',
        tenant: payload.tenant,
        ...(typeof payload.sid === 'string' ? { sid: payload.sid } : {}),
        ...(PERMISSIONS_IN_ACCESS_TOKEN && payload.perms !== undefined
          ? {
              grants: parsePermissions(payload.perms),
              department:
                typeof payload.department === 'string'
                  ? payload.department
                  : null,
            }
          : {}),
        expiresAt:
          typeof payload.exp === 'number' ? payload.exp * 1000 : undefined,
        exp: typeof payload.exp === 'number' ? payload.exp : undefined,
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
          key: await importSPKI(normalizedKey, publicKeyAlg),
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

function parsePermissions(perms: unknown): Capability[] {
  if (!Array.isArray(perms)) {
    throw new UnauthorizedException('Token permissions are malformed');
  }
  try {
    return perms.map((entry) => {
      if (typeof entry !== 'string') throw new TypeError('not a string');
      return parseCapabilityString(entry);
    });
  } catch {
    throw new UnauthorizedException('Token permissions are malformed');
  }
}
