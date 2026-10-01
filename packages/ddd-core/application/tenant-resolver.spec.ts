/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { afterEach, describe, expect, it } from 'vitest';
import { MissingTenantContextError } from '../domain/exceptions/missing-tenant-context.exception.js';
import {
  requireTenant,
  requireTenantId,
  setTenantResolver,
} from './tenant-resolver.js';

afterEach(() => setTenantResolver(undefined));

describe('requireTenant', () => {
  it('returns an explicit tenant string, even with a resolver registered', () => {
    expect(requireTenant('key', 'tenant_a')).toBe('tenant_a');
    setTenantResolver(() => 'resolved');
    expect(requireTenant('key', 'tenant_a')).toBe('tenant_a');
  });

  it("uses an object's tenantId before the resolver", () => {
    setTenantResolver(() => 'resolved');
    expect(requireTenant('key', { tenantId: 'ctx' })).toBe('ctx');
  });

  it('falls back to the resolver without a source, or for an object without tenantId', () => {
    setTenantResolver(() => 'resolved');
    expect(requireTenant('key')).toBe('resolved');
    expect(requireTenant('key', {})).toBe('resolved');
  });

  it.each([
    ['no source and no resolver', () => requireTenant('idempotency key')],
    [
      'an object without tenantId and no resolver',
      () => requireTenant('idempotency key', {}),
    ],
    [
      'an empty string, even with a resolver',
      () => {
        setTenantResolver(() => 'resolved');
        return requireTenant('idempotency key', '');
      },
    ],
    [
      'an empty tenantId, even with a resolver',
      () => {
        setTenantResolver(() => 'resolved');
        return requireTenant('idempotency key', { tenantId: '' });
      },
    ],
    [
      'a resolver that returns nothing',
      () => {
        setTenantResolver(() => undefined);
        return requireTenant('idempotency key');
      },
    ],
    [
      'a resolver that returns an empty tenant',
      () => {
        setTenantResolver(() => '');
        return requireTenant('idempotency key');
      },
    ],
  ])('fails closed for %s', (_label, resolve) => {
    expect(resolve).toThrow(MissingTenantContextError);
    expect(resolve).toThrow('idempotency key');
  });
});

describe('requireTenantId', () => {
  it('resolves exactly as requireTenant with the arguments reversed', () => {
    setTenantResolver(() => 'resolved');

    expect(requireTenantId({ tenantId: 'ctx' }, 'key')).toBe('ctx');
    expect(requireTenantId(undefined, 'key')).toBe('resolved');
    setTenantResolver(undefined);
    expect(() => requireTenantId(undefined, 'cache key')).toThrow(
      MissingTenantContextError,
    );
  });
});

describe('setTenantResolver', () => {
  it('reads the resolver each time a tenant is required', () => {
    let tenant = 'first';
    setTenantResolver(() => tenant);
    expect(requireTenant('key')).toBe('first');

    tenant = 'second';
    expect(requireTenant('key')).toBe('second');
  });

  it('is replaced by a later call and removed by undefined', () => {
    setTenantResolver(() => 'first');
    setTenantResolver(() => 'second');
    expect(requireTenant('key')).toBe('second');

    setTenantResolver(undefined);
    expect(() => requireTenant('key')).toThrow(MissingTenantContextError);
  });
});
