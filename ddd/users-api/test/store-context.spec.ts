import { RequestContext } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/libsql';
import { MikroORM as PostgresORM } from '@mikro-orm/postgresql';
import { createLibsqlOrmOptions } from '@persistence/libsql-options';
import { MikroOrmStore } from '@persistence/mikro-orm.store';
import { PostgresMikroOrmStore } from '@persistence/postgres-mikro-orm.store';
import { createPostgresOrmOptions } from '@persistence/postgres-options';
import type { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('MikroOrmStore with real EntityManager contexts', () => {
  const orms: MikroORM[] = [];
  let store: MikroOrmStore;
  const tenant = { schema: 'tenant_a' };

  beforeAll(async () => {
    for (let i = 0; i < 2; i++) {
      orms.push(
        await MikroORM.init({
          ...createLibsqlOrmOptions(':memory:'),
          debug: false,
        }),
      );
    }
    store = new MikroOrmStore(tenant as TenantSchemaContext);
    const registry = Reflect.get(store, 'orms') as Map<string, MikroORM>;
    registry.set('tenant_a', orms[0]);
    registry.set('tenant_b', orms[1]);
  });

  afterAll(async () => {
    await Promise.all(orms.map((orm) => orm.close(true)));
  });

  it('forks without enabling global context access', () => {
    tenant.schema = 'tenant_a';
    expect(() => orms[0].em.getContext()).toThrow();
    expect(store.em).not.toBe(orms[0].em);
    expect(store.sem.getDriver()).toBe(orms[0].em.getDriver());
  });

  it('reuses only the active tenant context', () => {
    RequestContext.create(orms[0].em, () => {
      tenant.schema = 'tenant_a';
      expect(store.em).toBe(RequestContext.getEntityManager());
      tenant.schema = 'tenant_b';
      expect(store.em).not.toBe(RequestContext.getEntityManager());
      expect(store.em.getDriver()).toBe(orms[1].em.getDriver());
      expect(store.sem.getDriver()).toBe(orms[1].em.getDriver());
    });
  });
});

describe('PostgresMikroOrmStore context selection', () => {
  let orm: PostgresORM;
  let store: PostgresMikroOrmStore;
  const tenant = { schema: 'tenant_a' };

  beforeAll(async () => {
    // Context/fork selection requires real metadata, but no SQL connection.
    orm = await PostgresORM.init({
      ...createPostgresOrmOptions('tenant_a'),
      connect: false,
      debug: false,
    });
    store = new PostgresMikroOrmStore(tenant as TenantSchemaContext);
    store.orm = orm;
  });

  afterAll(async () => {
    await orm?.close(true);
  });

  it('forks with the requested schema when no context exists', () => {
    tenant.schema = 'tenant_b';
    expect(store.em.schema).toBe('tenant_b');
    expect(store.sem.schema).toBe('tenant_b');
  });

  it('does not reuse another tenant schema from the active context', () => {
    RequestContext.create(orm.em.fork({ schema: 'tenant_a' }), () => {
      tenant.schema = 'tenant_a';
      expect(store.em).toBe(RequestContext.getEntityManager());
      tenant.schema = 'tenant_b';
      expect(store.em).not.toBe(RequestContext.getEntityManager());
      expect(store.em.schema).toBe('tenant_b');
      expect(store.sem.schema).toBe('tenant_b');
    });
  });
});
