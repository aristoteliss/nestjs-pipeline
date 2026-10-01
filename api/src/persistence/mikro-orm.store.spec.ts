/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { persistenceDialect } from '@cqrs-ddd/core/persistence';
import { MikroOrmDialect } from '@cqrs-ddd/mikro-orm';
import { MikroORM } from '@mikro-orm/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MikroOrmStore } from './mikro-orm.store.js';
import { TenantSchemaContext } from './tenant-schema.context.js';
import { UnknownTenantSchemaError } from './tenant-schema.errors.js';

/** Starts the store over ORMs that discover metadata but never connect. */
async function started(env: Record<string, string>) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const init = vi
    .spyOn(MikroORM, 'init')
    .mockImplementation(
      async (options) => new MikroORM({ ...options, debug: false }),
    );
  const tenants = new TenantSchemaContext();
  const store = new MikroOrmStore(tenants);
  await store.onModuleInit();
  return { store, tenants, init };
}

describe('MikroOrmStore', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('keeps one libSQL database per tenant', async () => {
    const { store, tenants, init } = await started({
      DB_ENGINE: 'libsql',
      DB_DEFAULT_SCHEMA: 'tenant_a',
      SQLITE_TENANTS: 'tenant_b',
      SQLITE_DATABASE_TEMPLATE: 'file:/tmp/{tenant}.db',
    });

    expect(init).toHaveBeenCalledTimes(2);
    const a = tenants.run('tenant_a', () => store.em);
    const b = tenants.run('tenant_b', () => store.em);
    expect(a.config.get('dbName')).toBe('file:/tmp/tenant_a.db');
    expect(b.config.get('dbName')).toBe('file:/tmp/tenant_b.db');
    expect(persistenceDialect()).toBeInstanceOf(MikroOrmDialect);
    await store.onModuleDestroy();
  });

  it('keeps one PostgreSQL schema per tenant on one ORM', async () => {
    const { store, tenants, init } = await started({
      DB_ENGINE: 'postgres',
      TENANT_SCHEMAS: 'tenant_a,tenant_b',
    });

    expect(init).toHaveBeenCalledOnce();
    const a = tenants.run('tenant_a', () => store.em);
    const b = tenants.run('tenant_b', () => store.em);
    expect(a.schema).toBe('tenant_a');
    expect(b.schema).toBe('tenant_b');
    expect(a.getDriver()).toBe(b.getDriver());
    await store.onModuleDestroy();
  });

  it('rejects a tenant that is not configured', async () => {
    const { store, tenants } = await started({
      DB_ENGINE: 'postgres',
      TENANT_SCHEMAS: 'tenant_a',
    });

    expect(() => tenants.run('tenant_z', () => store.em)).toThrow(
      UnknownTenantSchemaError,
    );
    await expect(
      tenants.run('tenant_z', () => store.transactional(async () => 1)),
    ).rejects.toBeInstanceOf(UnknownTenantSchemaError);
    await store.onModuleDestroy();
  });

  it('closes every ORM once on shutdown', async () => {
    const { store } = await started({
      DB_ENGINE: 'postgres',
      TENANT_SCHEMAS: 'tenant_a,tenant_b',
    });
    const close = vi.spyOn(MikroORM.prototype, 'close');

    await store.onModuleDestroy();

    expect(close).toHaveBeenCalledOnce();
  });
});
