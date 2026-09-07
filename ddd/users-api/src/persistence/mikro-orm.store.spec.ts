import { describe, expect, it, vi } from 'vitest';
import { MikroOrmStore } from './mikro-orm.store';
import type { TenantSchemaContext } from './tenant-schema.context';

describe('MikroOrmStore', () => {
  const mockTenantContext: TenantSchemaContext = {
    schema: 'tenant_a',
  } as TenantSchemaContext;

  it('uses context-bound EntityManager when getContext() returns a compatible fork', () => {
    const driver = {};
    const contextEm = { id: 'context-em', getDriver: () => driver };
    const rootEm = {
      id: 'root-em',
      getDriver: () => driver,
      getContext: vi.fn().mockReturnValue(contextEm),
      fork: vi.fn(),
    };
    const store = new MikroOrmStore(mockTenantContext);
    (store as any).orms.set('tenant_a', { em: rootEm });

    expect(store.em).toBe(contextEm);
    expect(rootEm.fork).not.toHaveBeenCalled();
    expect((contextEm as any).__tenant).toBeUndefined();
  });

  it('forks when no contextual EntityManager is active without monkey-patching it', () => {
    const forkedEm = { id: 'forked-em' };
    const rootEm = {
      id: 'root-em',
      getContext: vi.fn().mockReturnValue(undefined),
      fork: vi.fn().mockReturnValue(forkedEm),
    };
    const store = new MikroOrmStore(mockTenantContext);
    (store as any).orms.set('tenant_a', { em: rootEm });

    expect(store.em).toBe(forkedEm);
    expect(rootEm.fork).toHaveBeenCalled();
    expect((forkedEm as any).__tenant).toBeUndefined();
  });

  it('rejects a context manager registered to another tenant and creates a new fork', () => {
    const driver = {};
    const contextEmTenantB = { id: 'context-em-b', getDriver: () => driver };
    const forkedEmTenantA = { id: 'forked-em-a' };
    const rootEm = {
      id: 'root-em',
      getDriver: () => driver,
      getContext: vi.fn().mockReturnValue(contextEmTenantB),
      fork: vi.fn().mockReturnValue(forkedEmTenantA),
    };
    const store = new MikroOrmStore(mockTenantContext);
    (store as any).orms.set('tenant_a', { em: rootEm });
    (store as any).entityManagerTenants.mark(contextEmTenantB, 'tenant_b');

    expect(store.em).toBe(forkedEmTenantA);
    expect(rootEm.fork).toHaveBeenCalled();
    expect((forkedEmTenantA as any).__tenant).toBeUndefined();
  });

  it('rejects a context manager from another ORM configuration', () => {
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
    const store = new MikroOrmStore(mockTenantContext);
    (store as any).orms.set('tenant_a', {
      em: rootEm,
      config: { dbName: 'users_tenant_a.db' },
    });

    expect(store.em).toBe(forkedEmTenantA);
  });

  it('withFork provides a dedicated fork and leaves third-party objects untouched', async () => {
    const forkedEm = { id: 'scoped-fork' };
    const rootEm = { id: 'root-em', fork: vi.fn().mockReturnValue(forkedEm) };
    const store = new MikroOrmStore(mockTenantContext);
    (store as any).orms.set('tenant_a', { em: rootEm });

    await expect(
      store.withFork(async (em) => {
        expect(em).toBe(forkedEm);
        expect((em as any).__tenant).toBeUndefined();
        return 'fork-result';
      }),
    ).resolves.toBe('fork-result');
  });

  it('transactional executes callback within the registered fork', async () => {
    const forkedEm = {
      transactional: vi.fn().mockImplementation((cb) => cb({ id: 'tx-em' })),
    };
    const rootEm = { fork: vi.fn().mockReturnValue(forkedEm) };
    const store = new MikroOrmStore(mockTenantContext);
    (store as any).orms.set('tenant_a', { em: rootEm });

    await expect(
      store.transactional(async (em) => {
        expect(em).toEqual({ id: 'tx-em' });
        return 42;
      }),
    ).resolves.toBe(42);
  });
});
