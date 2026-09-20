/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { MikroORM } from '@mikro-orm/postgresql';
import { Migration20260830000000 } from '@persistence/migrations/Migration20260830000000';
import { Migration20260921000000 } from '@persistence/migrations/Migration20260921000000';
import { createPostgresOrmOptions } from '@persistence/postgres-options';
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { UserPermissionsProjector } from '../src/auths/persistence/user-permissions.projector';

describe('PostgreSQL migration tenant isolation', () => {
  let postgres: StartedTestContainer | undefined;
  const orms: MikroORM[] = [];

  beforeAll(async () => {
    postgres = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_DB: 'migration_test',
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/, 2),
      )
      .start();
    vi.stubEnv('DATABASE_HOST', postgres.getHost());
    vi.stubEnv('DATABASE_PORT', String(postgres.getMappedPort(5432)));
    vi.stubEnv('DATABASE_NAME', 'migration_test');
    vi.stubEnv('DATABASE_USER', 'test');
    vi.stubEnv('DATABASE_PASSWORD', 'test');
  });

  afterAll(async () => {
    try {
      await Promise.all(orms.map((orm) => orm.close(true)));
    } finally {
      vi.unstubAllEnvs();
      await postgres?.stop();
    }
  });

  async function openTenant(
    schema: string,
    migrationsList: unknown[] = [Migration20260830000000],
  ): Promise<MikroORM> {
    const options = createPostgresOrmOptions(schema);
    const orm = await MikroORM.init({
      ...options,
      debug: false,
      migrations: {
        ...options.migrations,
        // Load the real migration directly so this test also works before build.
        migrationsList: migrationsList as never,
        snapshot: false,
      },
    });
    orms.push(orm);
    return orm;
  }

  it('isolates DDL, seed data, migration history, and rollback from other tenants and public', async () => {
    const tenantA = await openTenant('tenant_a');
    const tenantB = await openTenant('tenant_b');
    const connection = tenantA.em.getConnection();
    await connection.execute('create schema tenant_a');
    await connection.execute('create schema tenant_b');
    // Same-named public tables must neither collide with up() nor be dropped by down().
    await connection.execute(
      'create table public.users (marker text primary key)',
    );
    await connection.execute("insert into public.users values ('keep-public')");
    await connection.execute(
      'create table public.roles (marker text primary key)',
    );
    await connection.execute(
      "insert into public.roles values ('keep-public-role')",
    );

    vi.stubEnv('SEED_TENANT', 'tenant_a');
    expect(await tenantA.migrator.up({ schema: 'tenant_a' })).toHaveLength(1);
    vi.stubEnv('SEED_TENANT', 'tenant_b');
    expect(await tenantB.migrator.up({ schema: 'tenant_b' })).toHaveLength(1);
    expect(await tenantA.migrator.up({ schema: 'tenant_a' })).toHaveLength(0);
    expect(await tenantB.migrator.up({ schema: 'tenant_b' })).toHaveLength(0);

    const usersA = await connection.execute(
      'select * from tenant_a.users order by id',
    );
    const usersB = await connection.execute(
      'select * from tenant_b.users order by id',
    );
    expect(usersA).toHaveLength(8);
    expect(usersB).toHaveLength(8);
    expect(usersA).not.toEqual(usersB);
    expect(
      await tenantA.migrator.getExecuted({ schema: 'tenant_a' }),
    ).toHaveLength(1);
    expect(
      await tenantB.migrator.getExecuted({ schema: 'tenant_b' }),
    ).toHaveLength(1);
    expect(
      await connection.execute(
        "select tablename from pg_tables where schemaname = 'public' order by tablename",
      ),
    ).toEqual([{ tablename: 'roles' }, { tablename: 'users' }]);

    expect(await tenantA.migrator.down({ schema: 'tenant_a' })).toHaveLength(1);
    expect(
      await tenantA.migrator.getExecuted({ schema: 'tenant_a' }),
    ).toHaveLength(0);
    expect(
      await tenantB.migrator.getExecuted({ schema: 'tenant_b' }),
    ).toHaveLength(1);
    expect(
      await connection.execute(
        "select tablename from pg_tables where schemaname = 'tenant_a' order by tablename",
      ),
    ).toEqual([{ tablename: 'mikro_orm_migrations' }]);
    expect(
      await connection.execute('select * from tenant_b.users order by id'),
    ).toEqual(usersB);
    expect(await connection.execute('select * from public.users')).toEqual([
      { marker: 'keep-public' },
    ]);
    expect(await connection.execute('select * from public.roles')).toEqual([
      { marker: 'keep-public-role' },
    ]);

    vi.stubEnv('SEED_TENANT', 'tenant_a');
    expect(await tenantA.migrator.up({ schema: 'tenant_a' })).toHaveLength(1);
    expect(
      await connection.execute('select * from tenant_a.users'),
    ).toHaveLength(8);
    expect(
      await connection.execute('select * from tenant_b.users order by id'),
    ).toEqual(usersB);
  });

  it('backfills materialized permission rules, verifies them and cascades role deletion', async () => {
    const orm = await openTenant('tenant_rules', [
      Migration20260830000000,
      Migration20260921000000,
    ]);
    const connection = orm.em.getConnection();
    await connection.execute('create schema tenant_rules');
    vi.stubEnv('SEED_TENANT', 'tenant_rules');

    expect(await orm.migrator.up({ schema: 'tenant_rules' })).toHaveLength(2);

    const projector = new UserPermissionsProjector();
    const rows = await connection.execute(
      'select user_id, position, source, role_id, inverted from tenant_rules.user_permission_rules order by user_id, position',
    );
    expect(rows.length).toBeGreaterThan(0);
    const denied = rows.filter(
      (row: { source: string }) => row.source === 'denied',
    );
    expect(denied.length).toBeGreaterThan(0);
    expect(
      denied.every((row: { inverted: boolean }) => row.inverted === true),
    ).toBe(true);
    expect(await projector.findDrift(orm.em.fork() as never)).toEqual([]);

    await orm.em.fork().transactional((em) =>
      projector.rebuild(
        em as never,
        rows.map((row: { user_id: string }) => row.user_id),
      ),
    );
    expect(await projector.findDrift(orm.em.fork() as never)).toEqual([]);

    const [{ role_id: roleId }] = await connection.execute(
      "select role_id from tenant_rules.user_permission_rules where source = 'role' limit 1",
    );
    await connection.execute('delete from tenant_rules.roles where id = ?', [
      roleId,
    ]);
    expect(
      await connection.execute(
        'select * from tenant_rules.user_permission_rules where role_id = ?',
        [roleId],
      ),
    ).toEqual([]);
    expect(await projector.findDrift(orm.em.fork() as never)).toEqual([]);

    expect(await orm.migrator.down({ schema: 'tenant_rules' })).toHaveLength(1);
    expect(
      await connection.execute(
        "select tablename from pg_tables where schemaname = 'tenant_rules' and tablename = 'user_permission_rules'",
      ),
    ).toEqual([]);
  });

  it('overlaps two reads issued concurrently on one forked EntityManager', async () => {
    const orm = await openTenant('tenant_rules');
    const em = orm.em.fork();
    const sleep = () => em.getConnection().execute('select pg_sleep(0.4)');

    const started = Date.now();
    await Promise.all([sleep(), sleep()]);

    expect(Date.now() - started).toBeLessThan(750);
  });
});
