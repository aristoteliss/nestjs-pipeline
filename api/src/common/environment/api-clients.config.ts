/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type Capability,
  parseCapabilityString,
} from '@cqrs-ddd/pipeline-casl';
import { Logger } from '@nestjs/common';

export interface ApiClient {
  readonly key: string;
  readonly tenants: ReadonlySet<string>;
  readonly grants?: Capability[];
}

/**
 * Machine clients from the `API_CLIENTS` JSON array, keyed by id and read once
 * at startup. An entry is `{ id, key, tenant | tenants, rules? }`; `rules` are
 * compact capability strings (`[!]subject|action[|conditions[|fields[|reason]]]`)
 * and a malformed one fails startup. An entry without an id, a key or a tenant
 * is skipped, and invalid JSON disables API-client authentication with a warning.
 *
 * @example
 * ```env
 * API_CLIENTS='[{"id":"reporting-service","key":"<secret>","tenants":["tenant_a"],"rules":["User|read|*|id,username","Role|read|*"]}]'
 * ```
 */
export const API_CLIENTS: ReadonlyMap<string, ApiClient> = parseApiClients(
  process.env.API_CLIENTS,
);

function parseApiClients(raw: string | undefined): Map<string, ApiClient> {
  const clients = new Map<string, ApiClient>();
  if (!raw) return clients;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    Logger.warn(
      'API_CLIENTS contains invalid JSON; API-client authentication is disabled.',
      'ApiClients',
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
