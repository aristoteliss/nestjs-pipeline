/* Copyright (C) 2026-present Aristotelis — see repository license. */
import {
  type EntityManager,
  RequestContext,
  TransactionContext,
} from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/libsql';
import { MikroORM as PostgresORM } from '@mikro-orm/postgresql';
import { createLibsqlOrmOptions } from '@persistence/libsql-options';
import { MikroOrmStore } from '@persistence/mikro-orm.store';
import { PostgresMikroOrmStore } from '@persistence/postgres-mikro-orm.store';
import { createPostgresOrmOptions } from '@persistence/postgres-options';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type Manager = EntityManager;

interface StoreUnderTest {
  readonly em: Manager;
  readonly sem: Manager;
}

interface Adapter {
  store: StoreUnderTest;
  tenants: TenantSchemaContext;
  /** A fork that belongs to the tenant's own ORM and schema. */
  tenantFork(tenant: string): Manager;
  /** Whether a manager targets the tenant's database or schema. */
  ownedBy(manager: Manager, tenant: string): boolean;
  /** A manager from another ORM instance with its own configuration. */
  foreignConfigManager(): Manager;
  /** A manager from an ORM of the other database driver. */
  foreignDriverManager(): Manager;
  close(): Promise<void>;
}

async function libsqlOrm(): Promise<MikroORM> {
  return MikroORM.init({ ...createLibsqlOrmOptions(':memory:'), debug: false });
}

async function postgresOrm(schema: string): Promise<PostgresORM> {
  // Context and fork selection need real metadata, not a SQL connection.
  return PostgresORM.init({
    ...createPostgresOrmOptions(schema),
    connect: false,
    debug: false,
  });
}

async function libsqlAdapter(): Promise<Adapter> {
  const tenants = new TenantSchemaContext();
  const orms = new Map([
    ['tenant_a', await libsqlOrm()],
    ['tenant_b', await libsqlOrm()],
  ]);
  const foreign = await libsqlOrm();
  const otherDriver = await postgresOrm('tenant_a');
  const store = new MikroOrmStore(tenants);
  const registry = Reflect.get(store, 'orms') as Map<string, MikroORM>;
  for (const [tenant, orm] of orms) registry.set(tenant, orm);
  const orm = (tenant: string) => orms.get(tenant) as MikroORM;

  return {
    store,
    tenants,
    tenantFork: (tenant) => orm(tenant).em.fork() as unknown as Manager,
    ownedBy: (manager, tenant) =>
      manager.getDriver() === orm(tenant).em.getDriver(),
    foreignConfigManager: () => foreign.em.fork() as unknown as Manager,
    foreignDriverManager: () =>
      otherDriver.em.fork({ schema: 'tenant_a' }) as unknown as Manager,
    close: async () => {
      await Promise.all(
        [...orms.values(), foreign].map((instance) => instance.close(true)),
      );
      await otherDriver.close(true);
    },
  };
}

async function postgresAdapter(): Promise<Adapter> {
  const tenants = new TenantSchemaContext();
  const orm = await postgresOrm('tenant_a');
  const foreign = await postgresOrm('tenant_a');
  const otherDriver = await libsqlOrm();
  const store = new PostgresMikroOrmStore(tenants);
  store.orm = orm;

  return {
    store,
    tenants,
    tenantFork: (tenant) =>
      orm.em.fork({ schema: tenant }) as unknown as Manager,
    ownedBy: (manager, tenant) =>
      manager.getDriver() === orm.em.getDriver() && manager.schema === tenant,
    foreignConfigManager: () =>
      foreign.em.fork({ schema: 'tenant_a' }) as unknown as Manager,
    foreignDriverManager: () => otherDriver.em.fork() as unknown as Manager,
    close: async () => {
      await orm.close(true);
      await foreign.close(true);
      await otherDriver.close(true);
    },
  };
}

describe.each([
  ['MikroOrmStore (libSQL, database per tenant)', libsqlAdapter],
  ['PostgresMikroOrmStore (schema per tenant)', postgresAdapter],
])('%s tenant EntityManager selection', (_name, createAdapter) => {
  let adapter: Adapter;
  const asTenant = <T>(tenant: string, fn: () => T): T =>
    adapter.tenants.run(tenant, fn);

  beforeAll(async () => {
    adapter = await createAdapter();
  });

  afterAll(async () => {
    await adapter?.close();
  });

  it('forks for the active tenant when no context exists', () => {
    for (const tenant of ['tenant_a', 'tenant_b']) {
      asTenant(tenant, () => {
        const { em, sem } = adapter.store;
        expect(adapter.ownedBy(em, tenant)).toBe(true);
        expect(adapter.ownedBy(sem, tenant)).toBe(true);
        expect(em).not.toBe(sem);
      });
    }
  });

  it.each([
    ['request context', RequestContext],
    ['active transaction', TransactionContext],
  ])('reuses a %s of the active tenant only', (_kind, context) => {
    const fork = asTenant('tenant_a', () => adapter.tenantFork('tenant_a'));
    context.create(fork, () => {
      const active =
        context === RequestContext ? RequestContext.getEntityManager() : fork;
      expect(asTenant('tenant_a', () => adapter.store.em)).toBe(active);

      const other = asTenant('tenant_b', () => adapter.store.em);
      expect(other).not.toBe(active);
      expect(adapter.ownedBy(other, 'tenant_b')).toBe(true);
    });
  });

  it.each([
    ['another ORM configuration', () => adapter.foreignConfigManager()],
    ['another database driver', () => adapter.foreignDriverManager()],
  ])('never reuses a context from %s', (_case, manager) => {
    TransactionContext.create(manager(), () => {
      const em = asTenant('tenant_a', () => adapter.store.em);
      expect(adapter.ownedBy(em, 'tenant_a')).toBe(true);
    });
  });

  it('isolates concurrent tenants sharing one request context', async () => {
    const fork = adapter.tenantFork('tenant_a');
    await RequestContext.create(fork, async () => {
      const context = RequestContext.getEntityManager();
      const [a, b] = await Promise.all([
        asTenant('tenant_a', async () => {
          await Promise.resolve();
          return adapter.store.em;
        }),
        asTenant('tenant_b', async () => adapter.store.em),
      ]);
      expect(a).toBe(context);
      expect(b).not.toBe(context);
      expect(adapter.ownedBy(b, 'tenant_b')).toBe(true);
    });
  });
});
