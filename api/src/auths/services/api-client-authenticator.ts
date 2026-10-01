/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash, timingSafeEqual } from 'node:crypto';
import { requireTenant } from '@cqrs-ddd/core/application';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { HEADERS } from '../../common/constants/headers.constants.js';
import { API_CLIENTS } from '../../common/environment/api-clients.config.js';
import type { SessionPrincipal } from '../../common/types/session-principal.js';
import { firstHeaderValue } from './helpers/first-header-value.js';

/**
 * Authenticates machine-to-machine HTTP requests presenting `x-api-id` and `x-api-key` headers.
 *
 * This service operates completely statelessly without touching database tables or session cookies.
 * The clients come from `API_CLIENTS`, parsed once at startup (`api-clients.config.ts`).
 * Key comparisons are performed in constant time by comparing SHA-256 fixed-length digests, preventing
 * timing side-channel attacks that could leak secret key lengths or character prefixes.
 * Successful authentication explicitly marks the principal as `service`; authorization never infers
 * machine identity from the syntax of the API client id.
 *
 * A client's rules become the principal's `grants`, which are its complete authorization: service
 * principals never read the users tables.
 *
 * @example
 * ```bash
 * # Calling a protected endpoint with API credentials
 * curl https://api.example.com/users \
 *   -H "x-tenant-schema: tenant_a" \
 *   -H "x-api-id: reporting-service" \
 *   -H "x-api-key: <secret>"
 * ```
 */
@Injectable()
export class ApiClientAuthenticator {
  private readonly logger = new Logger(ApiClientAuthenticator.name);

  /**
   * Verifies API credentials provided in `x-api-id` and `x-api-key` request headers.
   *
   * @param req - Request object containing incoming HTTP headers.
   * @returns The resolved {@link SessionPrincipal} service principal if valid credentials match the active tenant,
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
  }): SessionPrincipal | undefined {
    const apiId = firstHeaderValue(req.headers?.[HEADERS.API_ID]);
    if (!apiId) return undefined;

    const apiKey = firstHeaderValue(req.headers?.[HEADERS.API_KEY]);
    const client = API_CLIENTS.get(apiId);
    const tenant = requireTenant('API client authentication');

    if (
      !client ||
      !apiKey ||
      !this.timingSafeEqualString(apiKey, client.key) ||
      !client.tenants.has(tenant)
    ) {
      this.logger.warn(
        `Rejected API client "${apiId}": missing, invalid, or tenant-mismatched credentials`,
      );
      throw new UnauthorizedException('Invalid API credentials');
    }

    this.logger.debug(
      `Authenticated API client ${apiId} from x-api-id/x-api-key headers`,
    );

    return {
      id: apiId,
      type: 'service',
      tenant,
      grants: client.grants,
    };
  }

  private timingSafeEqualString(a: string, b: string): boolean {
    const aHash = createHash('sha256').update(a).digest();
    const bHash = createHash('sha256').update(b).digest();
    return timingSafeEqual(aHash, bHash);
  }
}
