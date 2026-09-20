/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Runs a persistence script the way `pnpm <script>` does. Every variable the
 * scripts read is pinned, so a local env file cannot redirect them.
 */
function runScript(script: string, dir: string, args: string[] = []) {
  return spawnSync(
    'pnpm',
    ['exec', 'tsx', `src/persistence/${script}`, ...args],
    {
      cwd: join(__dirname, '..'),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DB_ENGINE: 'libsql',
        DB_DEFAULT_SCHEMA: 'tenant',
        SQLITE_TENANTS: '',
        SQLITE_DATABASE_TEMPLATE: `file:${join(dir, '{tenant}.db')}`,
        DATABASE_URL: `file:${join(dir, 'tenant.db')}`,
        AUTH_TOKEN: '',
      },
    },
  );
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'users-api-commands-'));
  dirs.push(dir);
  return dir;
}

describe('permission rule commands', () => {
  it('verify exits 0 after rebuild and non-zero after a hand edit', async () => {
    const dir = tempDir();
    const migrate = runScript('migrate.ts', dir);
    expect(migrate.status, migrate.stderr).toBe(0);

    const rebuild = runScript('rebuild-user-permissions.ts', dir);
    expect(rebuild.status, rebuild.stderr).toBe(0);
    expect(rebuild.stdout).toContain(
      'tenant: rebuilt permission rules for 8 user(s).',
    );

    const clean = runScript('verify-user-permissions.ts', dir);
    expect(clean.status, clean.stderr).toBe(0);
    expect(clean.stdout).toContain('tenant: no drift.');

    const client = createClient({ url: `file:${join(dir, 'tenant.db')}` });
    await client.execute(
      "update user_permission_rules set action = 'manage' where position = 1",
    );
    client.close();

    const drifted = runScript('verify-user-permissions.ts', dir);
    expect(drifted.status).toBe(1);
    expect(drifted.stdout).toContain('tenant: drifted user(s):');
  });

  it('migrates and reverts the rules table on SQLite', async () => {
    const dir = tempDir();

    expect(runScript('migrate.ts', dir).status).toBe(0);
    const revert = runScript('revert.ts', dir, ['--steps', '2']);
    expect(revert.status, revert.stderr).toBe(0);

    const client = createClient({ url: `file:${join(dir, 'tenant.db')}` });
    const tables = await client.execute(
      "select name from sqlite_master where type = 'table' and name in ('user_permission_rules', 'users')",
    );
    client.close();
    expect(tables.rows.map((row) => row.name)).toEqual(['users']);
  });
});
