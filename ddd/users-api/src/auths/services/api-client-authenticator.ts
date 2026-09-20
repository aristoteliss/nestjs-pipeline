/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { type Capability, parseCapabilityString } from '@nestjs-pipeline/casl';
import { AUTH_HEADERS } from '../../common/constants/auth-headers.constants';
import {
  type ITenantContext,
  TENANT_CONTEXT,
} from '../../common/context/tenant-context.port';
import type { SessionUser } from '../../common/types/SessionUser';

interface ApiClient {
  key: string;
  tenants: Set<string>;
  grants?: Capability[];
}

/**
 * Authenticates machine-to-machine HTTP requests presenting `x-api-id` and `x-api-key` headers.
 *
 * This service operates completely statelessly without touching database tables or session cookies.
 * Configured API clients are loaded from the `API_CLIENTS` environment variable as a JSON array.
 * Key comparisons are performed in constant time by comparing SHA-256 fixed-length digests, preventing
 * timing side-channel attacks that could leak secret key lengths or character prefixes.
 * Successful authentication explicitly marks the principal as `service`; authorization never infers
 * machine identity from the syntax of the API client id.
 *
 * Each client's `rules` are compact capability strings (`[!]subject|action[|conditions[|fields[|reason]]]`)
 * parsed once at startup; a malformed rule fails boot. They become the principal's `grants`, which are
 * its complete authorization: service principals never read the users tables.
 *
 * @example
 * ```bash
 * # Calling a protected endpoint with API credentials
 * curl https://api.example.com/users \
 *   -H "x-tenant-schema: tenant_a" \
 *   -H "x-api-id: reporting-service" \
 *   -H "x-api-key: <secret>"
 * ```
 *
 * @example
 * ```env
 * # Environment configuration (.env)
 * API_CLIENTS='[{"id":"reporting-service","key":"<secret>","tenants":["tenant_a"],"rules":["User|read|*|id,username","Role|read|*"]}]'
 * ```
 */
@Injectable()
export class ApiClientAuthenticator {
  private readonly logger = new Logger(ApiClientAuthenticator.name);
  private readonly apiClients: Map<string, ApiClient>;

  constructor(
    @Inject(TENANT_CONTEXT)
    private readonly tenantContext: ITenantContext,
  ) {
    this.apiClients = this.loadApiClients();
  }

  /**
   * Verifies API credentials provided in `x-api-id` and `x-api-key` request headers.
   *
   * @param req - Request object containing incoming HTTP headers.
   * @returns The resolved {@link SessionUser} service principal if valid credentials match the active tenant,
   *          or `undefined` if no `x-api-id` header was provided.
   * @throws {@link UnauthorizedException} If `x-api-id` is present but credentials are invalid,
   *         the API key is incorrect, or the client is not authorized for the active tenant schema.
   *
   * @example
   * ```ts
   * const principal = authenticator.authenticate({
   *   headers: {
   *     'x-api-id': 'reporting-service',
   *     'x-api-key': '<secret>',
   *   },
   * });
   * // returns: { id: 'reporting-service', principalType: 'service', tenant: 'tenant_a', grants: [{ subject: 'Role', action: 'read' }] }
   * ```
   */
  authenticate(req: {
    headers?: Record<string, string | string[] | undefined>;
  }): SessionUser | undefined {
    const apiId = this.firstHeaderValue(req.headers?.[AUTH_HEADERS.API_ID]);
    if (!apiId) return undefined;

    const apiKey = this.firstHeaderValue(req.headers?.[AUTH_HEADERS.API_KEY]);
    const client = this.apiClients.get(apiId);

    if (
      !client ||
      !apiKey ||
      !this.timingSafeEqualString(apiKey, client.key) ||
      !client.tenants.has(this.tenantContext.schema)
    ) {
      this.logger.warn(
        `Rejected API client "${apiId}": missing, invalid, or tenant-mismatched credentials`,
      );
      throw new UnauthorizedException('Invalid API credentials');
    }

    const tenant = this.tenantContext.schema;
    this.logger.debug(
      `Authenticated API client ${apiId} from x-api-id/x-api-key headers`,
    );

    return {
      id: apiId,
      principalType: 'service',
      tenant,
      grants: client.grants,
    };
  }

  private loadApiClients(): Map<string, ApiClient> {
    const clients = new Map<string, ApiClient>();
    const raw = process.env.API_CLIENTS;
    if (!raw) return clients;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn(
        'API_CLIENTS contains invalid JSON; API-client authentication is disabled.',
      );
      return clients;
    }

    for (const entry of Array.isArray(parsed) ? parsed : []) {
      if (
        entry &&
        typeof entry.id === 'string' &&
        entry.id.length > 0 &&
        typeof entry.key === 'string' &&
        entry.key.length > 0 &&
        (typeof entry.tenant === 'string' || Array.isArray(entry.tenants))
      ) {
        const configuredTenants: unknown[] =
          typeof entry.tenant === 'string' ? [entry.tenant] : entry.tenants;
        const tenants = new Set<string>(
          configuredTenants.filter(
            (tenant: unknown): tenant is string =>
              typeof tenant === 'string' && tenant.length > 0,
          ),
        );
        if (tenants.size === 0) continue;
        clients.set(entry.id, {
          key: entry.key,
          tenants,
          grants: parseRules(entry.id, entry.rules),
        });
      }
    }
    return clients;
  }

  private timingSafeEqualString(a: string, b: string): boolean {
    const aHash = createHash('sha256').update(a).digest();
    const bHash = createHash('sha256').update(b).digest();
    return timingSafeEqual(aHash, bHash);
  }

  private firstHeaderValue(
    value: string | string[] | undefined,
  ): string | undefined {
    const single = Array.isArray(value) ? value[0] : value;
    return typeof single === 'string' && single.length > 0 ? single : undefined;
  }
}

function parseRules(
  clientId: string,
  rules: unknown,
): Capability[] | undefined {
  if (rules === undefined) return undefined;
  if (!Array.isArray(rules) || rules.some((rule) => typeof rule !== 'string')) {
    throw new TypeError(
      `API_CLIENTS entry "${clientId}": rules must be an array of capability strings.`,
    );
  }
  return rules.map((rule: string, index) => {
    try {
      return parseCapabilityString(rule);
    } catch (error) {
      throw new TypeError(
        `API_CLIENTS entry "${clientId}": rule ${index} is malformed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });
}
