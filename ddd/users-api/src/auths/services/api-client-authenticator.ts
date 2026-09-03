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

import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  type Capability,
  type CapabilityString,
  normalizeCapability,
  serializeCapability,
  type UserCapabilities,
} from '@nestjs-pipeline/casl';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { AUTH_HEADERS } from '../../common/constants/auth-headers.constants';
import type { SessionUser } from '../../common/types/SessionUser';

/**
 * Authenticates machine-to-machine HTTP requests presenting `x-api-id` and `x-api-key` headers.
 *
 * This service operates completely statelessly without touching database tables or session cookies.
 * Configured API clients are loaded from the `API_CLIENTS` environment variable as a JSON array.
 * Key comparisons are performed in constant time by comparing SHA-256 fixed-length digests, preventing
 * timing side-channel attacks that could leak secret key lengths or character prefixes.
 *
 * @example
 * ```bash
 * # Calling a protected endpoint with API credentials
 * curl https://api.example.com/users \
 *   -H "x-tenant-schema: tenant_a" \
 *   -H "x-api-id: reporting-service" \
 *   -H "x-api-key: secret-api-key-999"
 * ```
 *
 * @example
 * ```env
 * # Environment configuration (.env)
 * API_CLIENTS='[{"id":"reporting-service","key":"secret-api-key-999","tenants":["tenant_a","tenant_b"],"capabilities":{"roles":["reporter"]}}]'
 * ```
 */
@Injectable()
export class ApiClientAuthenticator {
  private readonly logger = new Logger(ApiClientAuthenticator.name);
  private apiClients?: Map<
    string,
    { key: string; tenants: Set<string>; capabilities?: UserCapabilities }
  >;

  /**
   * Verifies API credentials provided in `x-api-id` and `x-api-key` request headers.
   *
   * @param req - Request object containing incoming HTTP headers.
   * @returns The resolved {@link SessionUser} principal if valid credentials match the active tenant,
   *          or `undefined` if no `x-api-id` header was provided.
   * @throws {@link UnauthorizedException} If `x-api-id` is present but credentials are invalid,
   *         the API key is incorrect, or the client is not authorized for the active tenant schema.
   *
   * @example
   * ```ts
   * const principal = authenticator.authenticate({
   *   headers: {
   *     'x-api-id': 'reporting-service',
   *     'x-api-key': 'secret-api-key-999',
   *   },
   * });
   * // returns: { id: 'reporting-service', tenant: 'tenant_a', capabilities: { roles: ['reporter'] } }
   * ```
   */
  authenticate(req: {
    headers?: Record<string, string | string[] | undefined>;
  }): SessionUser | undefined {
    const apiId = this.firstHeaderValue(req.headers?.[AUTH_HEADERS.API_ID]);
    if (!apiId) return undefined;

    const apiKey = this.firstHeaderValue(req.headers?.[AUTH_HEADERS.API_KEY]);
    const client = this.getApiClients().get(apiId);

    if (
      !client ||
      !apiKey ||
      !this.timingSafeEqualString(apiKey, client.key) ||
      !client.tenants.has(TenantSchemaContext.currentSchema)
    ) {
      this.logger.warn(
        `Rejected API client "${apiId}": missing, invalid, or tenant-mismatched credentials`,
      );
      throw new UnauthorizedException('Invalid API credentials');
    }

    const tenant = TenantSchemaContext.currentSchema;
    this.logger.debug(
      `Authenticated API client ${apiId} from x-api-id/x-api-key headers`,
    );

    return { id: apiId, tenant, capabilities: client.capabilities };
  }

  private getApiClients(): Map<
    string,
    { key: string; tenants: Set<string>; capabilities?: UserCapabilities }
  > {
    if (this.apiClients) return this.apiClients;

    const clients = new Map<
      string,
      { key: string; tenants: Set<string>; capabilities?: UserCapabilities }
    >();

    const raw = process.env.API_CLIENTS;
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);

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
              capabilities: this.compactUserCapabilities(entry.capabilities),
            });
          }
        }
      } catch (_e: unknown) {
        this.logger.warn(
          'API_CLIENTS contains invalid JSON or malformed credentials/capabilities; API-client authentication is disabled.',
        );
      }
    }

    this.apiClients = clients;
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
