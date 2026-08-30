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

import { afterEach, describe, expect, it } from 'vitest';
import { Migration20260830000000 } from './migrations/Migration20260830000000';

const ORIGINAL_SEED_TENANT = process.env.SEED_TENANT;

async function migrationSql(direction: 'up' | 'down'): Promise<string[]> {
  const migration = new Migration20260830000000(
    undefined as never,
    undefined as never,
  );

  await migration[direction]();
  return migration.getQueries().map(String);
}

afterEach(() => {
  if (ORIGINAL_SEED_TENANT === undefined) {
    delete process.env.SEED_TENANT;
  } else {
    process.env.SEED_TENANT = ORIGINAL_SEED_TENANT;
  }
});

describe('Migration20260830000000', () => {
  it('creates the current schema directly without upgrade compatibility SQL', async () => {
    const sql = (await migrationSql('up')).join('\n').toLowerCase();

    expect(sql).toContain('create table users');
    expect(sql).toContain('create table capabilities');
    expect(sql).toContain('inverted boolean not null default false');
    expect(sql).not.toContain('information_schema.columns');
    expect(sql).not.toContain('alter column inverted type');
  });

  it('seeds eight intentional demo users and both override directions', async () => {
    process.env.SEED_TENANT = 'tenant_acme';
    const sql = (await migrationSql('up')).join('\n');

    expect(sql.match(/insert into users /g)).toHaveLength(8);
    expect(sql.match(/insert into roles /g)).toHaveLength(5);
    expect(sql.match(/insert into capabilities /g)).toHaveLength(14);
    expect(sql.match(/insert into user_additional_capabilities /g)).toHaveLength(1);
    expect(sql.match(/insert into user_denied_capabilities /g)).toHaveLength(1);
    expect(sql).toContain('vince+tenant-acme@seed.local');
    expect(sql).toContain('grace+tenant-acme@seed.local');
  });

  it('uses only supported CASL user-context placeholders', async () => {
    const sql = (await migrationSql('up')).join('\n');

    expect(sql).not.toContain('${sessionUser.');
    expect(sql.match(/\$\{user\.department\}/g)).toHaveLength(4);
    expect(sql.match(/\$\{user\.id\}/g)).toHaveLength(2);
  });

  it('drops the complete demo schema on revert', async () => {
    const sql = (await migrationSql('down')).join('\n').toLowerCase();

    expect(sql).toContain('drop table if exists users');
    expect(sql).toContain('drop table if exists roles');
    expect(sql).toContain('drop table if exists capabilities');
    expect(sql).toContain('drop table if exists cache');
  });
});
