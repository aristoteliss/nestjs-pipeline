/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type EntityManager, MikroORM } from '@mikro-orm/core';
import type { LibSqlDriver } from '@mikro-orm/libsql';
import { createLibsqlOrmOptions } from '../../src/persistence/libsql-options';
import { Migration20260830000000 } from '../../src/persistence/migrations/Migration20260830000000';

export interface MigratedDb {
  orm: MikroORM<LibSqlDriver>;
  url: string;
  em: () => EntityManager;
  sql: (statement: string, params?: unknown[]) => Promise<unknown[]>;
  close: () => Promise<void>;
}

/** A temporary libSQL database with the complete schema and demo seed. */
export async function migratedDb(): Promise<MigratedDb> {
  const dir = mkdtempSync(join(tmpdir(), 'users-api-permissions-'));
  const url = `file:${join(dir, 'tenant.db')}`;
  const orm = await MikroORM.init<LibSqlDriver>({
    ...createLibsqlOrmOptions(url),
    debug: false,
    migrations: {
      migrationsList: [Migration20260830000000],
      snapshot: false,
    },
  });
  await orm.migrator.up();

  return {
    orm,
    url,
    em: () => orm.em.fork() as unknown as EntityManager,
    sql: (statement, params) =>
      orm.em.getConnection().execute(statement, params as never[]),
    close: async () => {
      await orm.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Inserts assignment rows with fixed timestamps; ids are caller-chosen so ordering is known. */
export function fixtures(db: MigratedDb) {
  const now = 1_700_000_000_000;
  return {
    user: (id: string, department: string | null) =>
      db.sql(
        'insert into users (id, created_at, updated_at, version, username, department, email) values (?, ?, ?, 1, ?, ?, ?)',
        [id, now, now, `user-${id}`, department, `${id}@fixture.test`],
      ),
    role: (id: string, name: string) =>
      db.sql(
        'insert into roles (id, created_at, updated_at, version, name) values (?, ?, ?, 1, ?)',
        [id, now, now, name],
      ),
    capability: (
      id: string,
      subject: string,
      action: string,
      rest: {
        conditions?: string;
        fields?: string;
        inverted?: boolean;
        reason?: string;
      } = {},
    ) =>
      db.sql(
        'insert into capabilities (id, created_at, updated_at, action, subject, conditions, inverted, reason, fields) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          now,
          now,
          action,
          subject,
          rest.conditions ?? null,
          rest.inverted ?? false,
          rest.reason ?? null,
          rest.fields ?? null,
        ],
      ),
    grant: (roleId: string, capabilityId: string) =>
      db.sql(
        'insert into role_capabilities (role_id, capability_id) values (?, ?)',
        [roleId, capabilityId],
      ),
    assign: (userId: string, roleId: string) =>
      db.sql('insert into user_roles (user_id, role_id) values (?, ?)', [
        userId,
        roleId,
      ]),
    additional: (userId: string, capabilityId: string) =>
      db.sql(
        'insert into user_additional_capabilities (user_id, capability_id) values (?, ?)',
        [userId, capabilityId],
      ),
    deny: (userId: string, capabilityId: string) =>
      db.sql(
        'insert into user_denied_capabilities (user_id, capability_id) values (?, ?)',
        [userId, capabilityId],
      ),
  };
}
