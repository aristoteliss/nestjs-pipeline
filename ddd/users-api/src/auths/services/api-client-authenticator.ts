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
import type { UserCapabilities } from '@nestjs-pipeline/casl';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { AUTH_HEADERS } from '../../common/constants/auth-headers.constants';
import type { SessionUser } from '../../common/types/SessionUser';
import { CapabilityCodec } from './capability-codec';

/**
 * Authenticates machine-to-machine HTTP requests presenting `x-api-id` and `x-api-key` headers.
 *
 * Successful API-client authentication emits `principalType: 'service'` so
 * authorization never needs to infer machine identity from the shape of `id`.
 */
@Injectable()
export class ApiClientAuthenticator {
  private readonly logger = new Logger(ApiClientAuthenticator.name);
  private apiClients?: Map<
    string,
    { key: string; tenants: Set<string>; capabilities?: UserCapabilities }
  >;

  constructor(private readonly tenantSchemaContext: TenantSchemaContext) {}

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
      !client.tenants.has(this.tenantSchemaContext.schema)
    ) {
      this.logger.warn(
        `Rejected API client "${apiId}": missing, invalid, or tenant-mismatched credentials`,
      );
      throw new UnauthorizedException('Invalid API credentials');
    }

    const tenant = this.tenantSchemaContext.schema;
    this.logger.debug(
      `Authenticated API client ${apiId} from x-api-id/x-api-key headers`,
    );

    return {
      id: apiId,
      principalType: 'service',
      tenant,
      capabilities: client.capabilities,
    };
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
              capabilities: CapabilityCodec.compactUserCapabilities(
                entry.capabilities,
              ),
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
}
