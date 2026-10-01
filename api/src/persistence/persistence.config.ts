/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { isSqlIdentifier } from '@cqrs-ddd/mikro-orm';
import { InvalidTenantSchemaError } from './tenant-schema.errors.js';

/** The database engine this process persists to. */
export type Engine = 'libsql' | 'postgres';

/** Persistence settings read from the environment. */
export interface PersistenceConfig {
  readonly engine: Engine;
  /** The tenant served when no tenant list is configured. */
  readonly defaultSchema: string;
  /** Every tenant this process serves: validated, deduplicated, never empty. */
  readonly tenants: readonly string[];
  /** Whether MikroORM logs its queries. */
  readonly debug: boolean;
  readonly libsql: {
    /** Database URL for a single tenant, and the base for local per-tenant files. */
    readonly url: string;
    readonly authToken?: string;
    /** Per-tenant URL containing `{tenant}`, required for several remote tenants. */
    readonly template?: string;
  };
  readonly postgres: {
    readonly host: string;
    readonly port: number;
    readonly dbName: string;
    readonly user: string;
    readonly password: string;
  };
}

const DEFAULT_SCHEMA = 'tenant';
const DEFAULT_LIBSQL_URL = 'file:src/persistence/local.db';

/**
 * Validates a tenant schema name: trimmed, and a plain SQL identifier.
 *
 * @throws {InvalidTenantSchemaError} When the name is blank or not an identifier.
 *
 * @example
 * ```ts
 * tenantSchema(' tenant_a '); // 'tenant_a'
 * tenantSchema('tenant-a');   // throws InvalidTenantSchemaError
 * ```
 */
export function tenantSchema(value: string): string {
  const name = value.trim();
  if (!isSqlIdentifier(name)) {
    throw new InvalidTenantSchemaError(name);
  }
  return name;
}

/**
 * The tenant served when no tenant list is configured: `DB_DEFAULT_SCHEMA`, or
 * `tenant` when it is unset or blank. It names exactly one schema.
 *
 * @throws {InvalidTenantSchemaError} When `DB_DEFAULT_SCHEMA` is not one valid name.
 *
 * @example
 * ```ts
 * // DB_DEFAULT_SCHEMA unset
 * defaultSchema(); // 'tenant'
 * ```
 */
export function defaultSchema(): string {
  const raw = process.env.DB_DEFAULT_SCHEMA?.trim();
  return raw ? tenantSchema(raw) : DEFAULT_SCHEMA;
}

function engine(): Engine {
  const raw = process.env.DB_ENGINE?.trim().toLowerCase();
  if (!raw || raw === 'libsql') return 'libsql';
  if (raw === 'postgres') return 'postgres';
  throw new Error(
    `DB_ENGINE must be "libsql" or "postgres", received "${process.env.DB_ENGINE}".`,
  );
}

function schemaList(name: string): string[] {
  const entries = (process.env[name] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set(entries.map(tenantSchema))];
}

function tenants(selected: Engine, fallback: string): string[] {
  if (selected === 'postgres') {
    const configured = schemaList('TENANT_SCHEMAS');
    return configured.length > 0 ? configured : [fallback];
  }
  return [...new Set([fallback, ...schemaList('SQLITE_TENANTS')])];
}

/**
 * Reads and validates the persistence settings. The one place that reads the
 * persistence environment variables.
 *
 * Tenants: PostgreSQL serves `TENANT_SCHEMAS`, or the default schema alone when
 * that list is empty; libSQL serves the default schema plus `SQLITE_TENANTS`.
 * Lists are split on commas, trimmed, stripped of blank entries and
 * deduplicated; an invalid name is rejected, never replaced by the default.
 *
 * @throws {InvalidTenantSchemaError} When a configured schema name is invalid.
 * @throws {Error} When `DB_ENGINE` or `DATABASE_PORT` is invalid.
 *
 * @example
 * ```ts
 * // DB_ENGINE=postgres TENANT_SCHEMAS="tenant_a, tenant_b"
 * const { engine, tenants } = persistenceConfig();
 * // engine === 'postgres', tenants === ['tenant_a', 'tenant_b']
 * ```
 */
export function persistenceConfig(): PersistenceConfig {
  const selected = engine();
  const fallback = defaultSchema();
  const port = Number(process.env.DATABASE_PORT ?? 5432);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(
      `DATABASE_PORT must be a positive integer, received "${process.env.DATABASE_PORT}".`,
    );
  }

  return {
    engine: selected,
    defaultSchema: fallback,
    tenants: tenants(selected, fallback),
    debug: process.env.NODE_ENV !== 'production',
    libsql: {
      url: process.env.DATABASE_URL ?? DEFAULT_LIBSQL_URL,
      authToken: process.env.AUTH_TOKEN,
      template: process.env.SQLITE_DATABASE_TEMPLATE,
    },
    postgres: {
      host: process.env.DATABASE_HOST ?? '127.0.0.1',
      port,
      dbName: process.env.DATABASE_NAME ?? 'nestjs_pipeline',
      user: process.env.DATABASE_USER ?? 'postgres',
      password: process.env.DATABASE_PASSWORD ?? 'postgres',
    },
  };
}
