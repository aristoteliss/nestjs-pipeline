import { MikroORM } from '@mikro-orm/postgresql';
import { Migration20260830000000 } from '@persistence/migrations/Migration20260830000000';
import { createPostgresOrmOptions } from '@persistence/postgres-options';
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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

  async function openTenant(schema: string): Promise<MikroORM> {
    const options = createPostgresOrmOptions(schema);
    const orm = await MikroORM.init({
      ...options,
      debug: false,
      migrations: {
        ...options.migrations,
        // Load the real migration directly so this test also works before build.
        migrationsList: [Migration20260830000000],
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
});
