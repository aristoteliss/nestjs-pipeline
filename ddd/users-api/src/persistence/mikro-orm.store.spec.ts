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

import { describe, expect, it, vi } from 'vitest';
import { MikroOrmStore } from './mikro-orm.store';
import type { TenantSchemaContext } from './tenant-schema.context';

describe('MikroOrmStore', () => {
  const mockTenantContext: TenantSchemaContext = {
    schema: 'tenant_a',
  } as TenantSchemaContext;

  it('uses context-bound EntityManager when getContext() returns an active fork', () => {
    const driver = {};
    const contextEm = { id: 'context-em', getDriver: () => driver };
    const rootEm = {
      id: 'root-em',
      getDriver: () => driver,
      getContext: vi.fn().mockReturnValue(contextEm),
      fork: vi.fn(),
    };
    const mockOrm = { em: rootEm };

    const store = new MikroOrmStore(mockTenantContext);
    (store as any).orms.set('tenant_a', mockOrm);

    const em = store.em;
    expect(em).toBe(contextEm);
    expect(rootEm.fork).not.toHaveBeenCalled();
  });

  it('forks a new EntityManager when no contextual EntityManager is active', () => {
    const forkedEm = { id: 'forked-em' };
    const rootEm = {
      id: 'root-em',
      getContext: vi.fn().mockReturnValue(undefined),
      fork: vi.fn().mockReturnValue(forkedEm),
    };
    const mockOrm = { em: rootEm };

    const store = new MikroOrmStore(mockTenantContext);
    (store as any).orms.set('tenant_a', mockOrm);

    const em = store.em;
    expect(em).toBe(forkedEm);
    expect(rootEm.fork).toHaveBeenCalled();
  });

  it('withFork provides a dedicated fork to callback and returns result', async () => {
    const forkedEm = { id: 'scoped-fork' };
    const rootEm = {
      id: 'root-em',
      fork: vi.fn().mockReturnValue(forkedEm),
    };
    const mockOrm = { em: rootEm };

    const store = new MikroOrmStore(mockTenantContext);
    (store as any).orms.set('tenant_a', mockOrm);

    const result = await store.withFork(async (em) => {
      expect(em).toBe(forkedEm);
      return 'fork-result';
    });

    expect(result).toBe('fork-result');
  });

  it('transactional executes callback within fork.transactional', async () => {
    const forkedEm = {
      id: 'tx-fork',
      transactional: vi.fn().mockImplementation((cb) => cb({ id: 'tx-em' })),
    };
    const rootEm = {
      id: 'root-em',
      fork: vi.fn().mockReturnValue(forkedEm),
    };
    const mockOrm = { em: rootEm };

    const store = new MikroOrmStore(mockTenantContext);
    (store as any).orms.set('tenant_a', mockOrm);

    const result = await store.transactional(async (em) => {
      expect(em).toEqual({ id: 'tx-em' });
      return 42;
    });

    expect(result).toBe(42);
    expect(forkedEm.transactional).toHaveBeenCalled();
  });

  it('safely catches and falls back to fork when getContext() throws an exception', () => {
    const forkedEm = { id: 'fallback-fork' };
    const rootEm = {
      id: 'root-em',
      getContext: vi.fn().mockImplementation(() => {
        throw new Error('RequestContext is not active');
      }),
      fork: vi.fn().mockReturnValue(forkedEm),
    };
    const mockOrm = { em: rootEm };

    const store = new MikroOrmStore(mockTenantContext);
    (store as any).orms.set('tenant_a', mockOrm);

    expect(() => store.em).not.toThrow();
    expect(store.em).toBe(forkedEm);
    expect(rootEm.fork).toHaveBeenCalled();
  });

  it('rejects context-bound EntityManager from another tenant and forks dedicated instance', () => {
    const driver = {};
    const contextEmTenantB = {
      id: 'context-em-b',
      getDriver: () => driver,
      __tenant: 'tenant_b',
    };
    const forkedEmTenantA = { id: 'forked-em-a' };
    const rootEm = {
      id: 'root-em',
      getDriver: () => driver,
      getContext: vi.fn().mockReturnValue(contextEmTenantB),
      fork: vi.fn().mockReturnValue(forkedEmTenantA),
    };
    const mockOrm = { em: rootEm };

    const store = new MikroOrmStore(mockTenantContext); // tenant_a
    (store as any).orms.set('tenant_a', mockOrm);

    const em = store.em;
    expect(em).toBe(forkedEmTenantA);
    expect(rootEm.fork).toHaveBeenCalled();
    expect((forkedEmTenantA as any).__tenant).toBe('tenant_a');
  });

  it('rejects context-bound EntityManager from another ORM instance with mismatched config', () => {
    const driver = {};
    const contextEmOtherOrm = {
      id: 'context-em-other',
      getDriver: () => driver,
      config: { dbName: 'users_tenant_b.db' },
    };
    const forkedEmTenantA = { id: 'forked-em-a' };
    const rootEm = {
      id: 'root-em',
      getDriver: () => driver,
      getContext: vi.fn().mockReturnValue(contextEmOtherOrm),
      fork: vi.fn().mockReturnValue(forkedEmTenantA),
    };
    const mockOrm = {
      em: rootEm,
      config: { dbName: 'users_tenant_a.db' },
    };

    const store = new MikroOrmStore(mockTenantContext); // tenant_a
    (store as any).orms.set('tenant_a', mockOrm);

    const em = store.em;
    expect(em).toBe(forkedEmTenantA);
    expect(rootEm.fork).toHaveBeenCalled();
  });
});
