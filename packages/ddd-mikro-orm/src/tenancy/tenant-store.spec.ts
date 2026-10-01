/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { MikroORM } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import { type TenantIsolation, TenantStore } from './tenant-store.js';

type Manager = {
  id: string;
  schema?: string;
  config: object;
  getDriver: () => object;
  transactional?: ReturnType<typeof vi.fn>;
};

/** A fake ORM whose root manager reports `context` and forks new managers. */
function fakeOrm(context?: () => Manager | undefined) {
  const config = {};
  const driver = {};
  const forks: Manager[] = [];
  const em = {
    id: 'root',
    config,
    getDriver: () => driver,
    getContext: vi.fn(() => context?.()),
    fork: vi.fn((options: { schema?: string }) => {
      const fork: Manager = {
        id: `fork-${forks.length}`,
        schema: options.schema,
        config,
        getDriver: () => driver,
        transactional: vi.fn((work) => work(fork)),
      };
      forks.push(fork);
      return fork;
    }),
  };
  const manager = (overrides: Partial<Manager> = {}): Manager => ({
    id: 'context',
    config,
    getDriver: () => driver,
    ...overrides,
  });
  return { orm: { em, config } as unknown as MikroORM, em, forks, manager };
}

function storeFor(
  orms: Record<string, MikroORM>,
  isolation: TenantIsolation = 'database',
) {
  let tenant = 'tenant_a';
  const store = new TenantStore({
    tenant: () => tenant,
    orm: (name) => orms[name],
    isolation,
  });
  return {
    store,
    as: <T>(name: string, read: () => T): T => {
      tenant = name;
      return read();
    },
  };
}

describe('TenantStore', () => {
  it('forks a new manager for the active tenant when no context exists', () => {
    const a = fakeOrm();
    const { store } = storeFor({ tenant_a: a.orm });

    const first = store.em;
    const second = store.em;

    expect(first).toBe(a.forks[0]);
    expect(second).toBe(a.forks[1]);
    expect(a.em.fork).toHaveBeenCalledWith({ disableContextResolution: true });
  });

  it('forks into the tenant schema under schema isolation', () => {
    const shared = fakeOrm();
    const { store, as } = storeFor(
      { tenant_a: shared.orm, tenant_b: shared.orm },
      'schema',
    );

    expect(as('tenant_b', () => store.em)).toMatchObject({
      schema: 'tenant_b',
    });
    expect(shared.em.fork).toHaveBeenCalledWith({
      disableContextResolution: true,
      schema: 'tenant_b',
    });
  });

  it('reuses the contextual manager of the active tenant', () => {
    let context: Manager | undefined;
    const a = fakeOrm(() => context);
    context = a.manager();
    const { store } = storeFor({ tenant_a: a.orm });

    expect(store.em).toBe(context);
    expect(a.em.fork).not.toHaveBeenCalled();
  });

  it('keeps a reused manager with the first tenant that claimed it', () => {
    let context: Manager | undefined;
    const shared = fakeOrm(() => context);
    context = shared.manager();
    const { store, as } = storeFor(
      { tenant_a: shared.orm, tenant_b: shared.orm },
      'schema',
    );

    expect(as('tenant_a', () => store.em)).toBe(context);
    expect(as('tenant_b', () => store.em)).not.toBe(context);
    expect(as('tenant_a', () => store.em)).toBe(context);
  });

  it('never reuses a fork made for another tenant', () => {
    let context: Manager | undefined;
    const shared = fakeOrm(() => context);
    const { store, as } = storeFor(
      { tenant_a: shared.orm, tenant_b: shared.orm },
      'database',
    );
    context = as('tenant_a', () => store.em) as unknown as Manager;

    expect(as('tenant_b', () => store.em)).not.toBe(context);
  });

  it.each([
    [
      'the root manager',
      (orm: ReturnType<typeof fakeOrm>) => orm.em as unknown as Manager,
    ],
    [
      'another schema',
      (orm: ReturnType<typeof fakeOrm>) => orm.manager({ schema: 'tenant_b' }),
    ],
    [
      'another configuration',
      (orm: ReturnType<typeof fakeOrm>) => orm.manager({ config: {} }),
    ],
    [
      'another driver',
      (orm: ReturnType<typeof fakeOrm>) =>
        orm.manager({ getDriver: () => ({}) }),
    ],
  ])('forks instead of reusing %s', (_case, contextFor) => {
    let context: Manager | undefined;
    const a = fakeOrm(() => context);
    context = contextFor(a);
    const { store } = storeFor({ tenant_a: a.orm });

    expect(store.em).toBe(a.forks[0]);
  });

  it('forks when reading the context throws', () => {
    const a = fakeOrm(() => {
      throw new Error('no context');
    });
    const { store } = storeFor({ tenant_a: a.orm });

    expect(store.em).toBe(a.forks[0]);
  });

  it('runs a transaction on a dedicated fork and returns its result', async () => {
    let context: Manager | undefined;
    const a = fakeOrm(() => context);
    context = a.manager();
    const { store } = storeFor({ tenant_a: a.orm });

    const result = await store.transactional(async (em) => {
      expect(em).toBe(a.forks[0]);
      return 42;
    });

    expect(result).toBe(42);
    expect(a.forks[0].transactional).toHaveBeenCalledOnce();
  });

  it('propagates what the tenant and ORM suppliers throw', async () => {
    const store = new TenantStore({
      tenant: () => {
        throw new Error('no tenant');
      },
      orm: () => fakeOrm().orm,
      isolation: 'database',
    });

    expect(() => store.em).toThrow('no tenant');
    await expect(store.transactional(async () => 1)).rejects.toThrow(
      'no tenant',
    );
  });
});
