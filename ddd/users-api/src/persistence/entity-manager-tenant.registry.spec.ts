import { describe, expect, it } from 'vitest';
import { EntityManagerTenantRegistry } from './entity-manager-tenant.registry';

describe('EntityManagerTenantRegistry', () => {
  it('tracks tenant ownership without adding properties to manager objects', () => {
    const registry = new EntityManagerTenantRegistry();
    const manager = {};

    registry.mark(manager, 'tenant_a');

    expect(registry.get(manager)).toBe('tenant_a');
    expect(registry.matches(manager, 'tenant_a')).toBe(true);
    expect(registry.matches(manager, 'tenant_b')).toBe(false);
    expect(Object.keys(manager)).toEqual([]);
    expect((manager as any).__tenant).toBeUndefined();
  });

  it('treats unregistered managers as reusable until first association', () => {
    const registry = new EntityManagerTenantRegistry();
    expect(registry.matches({}, 'tenant_a')).toBe(true);
  });
});
