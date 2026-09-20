/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { afterEach, describe, expect, it } from 'vitest';
import { Migration20260830000000 } from './migrations/Migration20260830000000';
import { Migration20260921000000 } from './migrations/Migration20260921000000';
import { Migration20260922000000 } from './migrations/Migration20260922000000';

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
    expect(
      sql.match(/insert into user_additional_capabilities /g),
    ).toHaveLength(1);
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

describe('Migration20260921000000', () => {
  async function sql(direction: 'up' | 'down'): Promise<string> {
    const migration = new Migration20260921000000(
      undefined as never,
      undefined as never,
    );
    await migration[direction]();
    return migration.getQueries().map(String).join('\n').toLowerCase();
  }

  it('creates the rules table with cascading origins and a per-user position key', async () => {
    const up = await sql('up');

    expect(up).toContain('create table user_permission_rules');
    expect(up).toContain(
      'user_id varchar(64) not null references users(id) on delete cascade',
    );
    expect(up).toContain(
      'role_id varchar(64) null references roles(id) on delete cascade',
    );
    expect(up).toContain(
      'capability_id varchar(64) not null references capabilities(id) on delete cascade',
    );
    expect(up).toContain('primary key (user_id, position)');
    expect(up).toContain('user_permission_rules_role_id_index');
    expect(up).toContain('user_permission_rules_capability_id_index');
  });

  it('backfills role, additional and denied rules in projector order', async () => {
    const up = await sql('up');

    expect(up).toContain('insert into user_permission_rules');
    expect(up).toContain(
      'row_number() over (partition by user_id order by grp, role_key, capability_id)',
    );
    expect(up).toMatch(
      /'denied',\s*null,\s*c\.id, c\.subject, c\.action, c\.conditions, c\.fields, true/,
    );
  });

  it('drops only the rules table on revert', async () => {
    expect(await sql('down')).toBe(
      'drop table if exists user_permission_rules;',
    );
  });
});

describe('Migration20260922000000', () => {
  async function sql(direction: 'up' | 'down'): Promise<string> {
    const migration = new Migration20260922000000(
      undefined as never,
      undefined as never,
    );
    await migration[direction]();
    return migration.getQueries().map(String).join('\n').toLowerCase();
  }

  it('discards raw-token sessions and recreates auth as hashed, versioned sessions', async () => {
    const up = await sql('up');

    expect(up.indexOf('delete from auth;')).toBeLessThan(
      up.indexOf('drop table auth;'),
    );
    expect(up).toContain(
      'user_id varchar(64) not null references users(id) on delete cascade',
    );
    expect(up).toContain('refresh_token_hash varchar(64) not null');
    expect(up).toContain('auth_refresh_token_hash_unique');
    expect(up).toContain('auth_previous_refresh_token_hash_idx');
    expect(up).toContain('version int not null default 1');
    expect(up).not.toMatch(/\btoken text\b/);
  });

  it('keeps rotated-token history that cascades with its session', async () => {
    expect(await sql('up')).toContain(
      'auth_id varchar(64) not null references auth(id) on delete cascade',
    );
  });

  it('restores the previous auth table on revert', async () => {
    const down = await sql('down');

    expect(down).toContain('drop table if exists auth_consumed_refresh_tokens');
    expect(down).toContain('token text not null');
  });
});
