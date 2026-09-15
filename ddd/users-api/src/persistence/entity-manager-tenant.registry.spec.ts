/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { EntityManagerTenantRegistry } from './entity-manager-tenant.registry';

describe('EntityManagerTenantRegistry', () => {
  it('tracks tenant associations without mutating the input instance', () => {
    const registry = new EntityManagerTenantRegistry();
    const manager = { name: 'forked-manager' };

    expect(registry.matches(manager, 'tenant_a')).toBe(true);

    registry.mark(manager, 'tenant_a');

    expect(registry.get(manager)).toBe('tenant_a');
    expect(registry.matches(manager, 'tenant_a')).toBe(true);
    expect(registry.matches(manager, 'tenant_b')).toBe(false);
    expect((manager as Record<string, unknown>).__tenant).toBeUndefined();
  });
});
