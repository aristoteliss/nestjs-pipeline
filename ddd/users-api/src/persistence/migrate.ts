/**
 * Database migration runner for the users-api Turso store.
 *
 * Standalone:  pnpm db:migrate
 * Programmatic: import { migrate } from './migrate' and call it with a Client.
 *
 * Tracks applied migrations in a `_migrations` table so each migration
 * runs at most once (idempotent on re-run).
 */

import type { Client } from '@libsql/client';

export interface Migration {
  version: number;
  name: string;
  sql: string[];
}

/**
 * All migrations in order. Append new ones at the end with the next version.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'create_users_and_cache',
    sql: [
      `CREATE TABLE IF NOT EXISTS users (
        id         TEXT     PRIMARY KEY,
        username   TEXT     NOT NULL,
        email      TEXT     NOT NULL,
        tenant_id  TEXT,
        department TEXT,
        created_at INTEGER  NOT NULL,
        updated_at INTEGER  NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS cache (
        key        TEXT    PRIMARY KEY,
        value      TEXT    NOT NULL,
        expires_at INTEGER
      )`,
    ],
  },
  {
    version: 2,
    name: 'create_casl_tables',
    sql: [
      `CREATE TABLE IF NOT EXISTS capabilities (
        id         TEXT    PRIMARY KEY,
        subject    TEXT    NOT NULL,
        action     TEXT    NOT NULL,
        conditions TEXT,
        inverted   INTEGER NOT NULL DEFAULT 0,
        reason     TEXT,
        fields     TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS roles (
        id   TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      )`,
      `CREATE TABLE IF NOT EXISTS role_capabilities (
        role_id       TEXT NOT NULL REFERENCES roles(id),
        capability_id TEXT NOT NULL REFERENCES capabilities(id),
        PRIMARY KEY (role_id, capability_id)
      )`,
      `CREATE TABLE IF NOT EXISTS user_roles (
        user_id TEXT NOT NULL REFERENCES users(id),
        role_id TEXT NOT NULL REFERENCES roles(id),
        PRIMARY KEY (user_id, role_id)
      )`,
      `CREATE TABLE IF NOT EXISTS user_additional_capabilities (
        user_id       TEXT NOT NULL REFERENCES users(id),
        capability_id TEXT NOT NULL REFERENCES capabilities(id),
        PRIMARY KEY (user_id, capability_id)
      )`,
      `CREATE TABLE IF NOT EXISTS user_denied_capabilities (
        user_id       TEXT NOT NULL REFERENCES users(id),
        capability_id TEXT NOT NULL REFERENCES capabilities(id),
        PRIMARY KEY (user_id, capability_id)
      )`,
    ],
  },
  {
    version: 3,
    name: 'add_role_timestamps',
    sql: [
      `ALTER TABLE roles ADD COLUMN created_at INTEGER`,
      `ALTER TABLE roles ADD COLUMN updated_at INTEGER`,
      `UPDATE roles SET created_at = (CAST(strftime('%s', 'now') AS INTEGER) * 1000), updated_at = (CAST(strftime('%s', 'now') AS INTEGER) * 1000) WHERE created_at IS NULL`,
    ],
  },
  {
    version: 4,
    name: 'create_auth_table',
    sql: [
      `CREATE TABLE IF NOT EXISTS auth (
        id         TEXT     PRIMARY KEY,
        tenant_id  TEXT,
        token      TEXT     NOT NULL,
        created_at INTEGER  NOT NULL,
        updated_at INTEGER  NOT NULL
      )`,
    ],
  },
];

/**
 * Run all pending migrations against the given client.
 * Returns the number of migrations applied.
 */
export async function migrate(client: Client): Promise<number> {
  // Ensure the migrations tracking table exists
  await client.execute(
    `CREATE TABLE IF NOT EXISTS _migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at INTEGER NOT NULL
    )`,
  );

  // Fetch already-applied versions
  const applied = await client.execute('SELECT version FROM _migrations');
  const appliedSet = new Set(applied.rows.map((r) => Number(r.version)));

  let count = 0;
  for (const m of migrations) {
    if (appliedSet.has(m.version)) continue;

    await client.batch(
      [
        ...m.sql,
        {
          sql: 'INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)',
          args: [m.version, m.name, Date.now()],
        },
      ],
      'write',
    );
    count++;
    console.log(`  ✓ migration ${m.version}: ${m.name}`);
  }

  return count;
}

// ── CLI entry point ────────────────────────────────────────────────────────
// Only runs when executed directly: pnpm db:migrate
if (
  process.argv[1] &&
  (process.argv[1].endsWith('/migrate.ts') ||
    process.argv[1].endsWith('/migrate.js'))
) {
  (async () => {
    process.loadEnvFile();
    const { createClient } = await import('@libsql/client');
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    });

    console.log('Running migrations…');
    const applied = await migrate(client);
    console.log(
      applied > 0
        ? `Done — ${applied} migration(s) applied.`
        : 'Already up to date.',
    );
    client.close();
  })();
}
