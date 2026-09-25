/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { afterEach, describe, expect, it } from 'vitest';
import { MissingTenantContextError } from '../domain/exceptions/missing-tenant-context.exception';
import { requireTenantId, setTenantResolver } from './tenant-resolver';

afterEach(() => setTenantResolver(undefined));

describe('requireTenantId', () => {
  it('returns an explicit tenant string, even with a resolver registered', () => {
    expect(requireTenantId('tenant_a', 'key')).toBe('tenant_a');
    setTenantResolver(() => 'resolved');
    expect(requireTenantId('tenant_a', 'key')).toBe('tenant_a');
  });

  it("uses an object's tenantId before the resolver", () => {
    setTenantResolver(() => 'resolved');
    expect(requireTenantId({ tenantId: 'ctx' }, 'key')).toBe('ctx');
  });

  it('falls back to the resolver without a source, or for an object without tenantId', () => {
    setTenantResolver(() => 'resolved');
    expect(requireTenantId(undefined, 'key')).toBe('resolved');
    expect(requireTenantId({}, 'key')).toBe('resolved');
  });

  it.each([
    [
      'no source and no resolver',
      () => requireTenantId(undefined, 'idempotency key'),
    ],
    [
      'an object without tenantId and no resolver',
      () => requireTenantId({}, 'idempotency key'),
    ],
    [
      'an empty string, even with a resolver',
      () => {
        setTenantResolver(() => 'resolved');
        return requireTenantId('', 'idempotency key');
      },
    ],
    [
      'an empty tenantId, even with a resolver',
      () => {
        setTenantResolver(() => 'resolved');
        return requireTenantId({ tenantId: '' }, 'idempotency key');
      },
    ],
    [
      'a resolver that returns nothing',
      () => {
        setTenantResolver(() => undefined);
        return requireTenantId(undefined, 'idempotency key');
      },
    ],
    [
      'a resolver that returns an empty tenant',
      () => {
        setTenantResolver(() => '');
        return requireTenantId(undefined, 'idempotency key');
      },
    ],
  ])('fails closed for %s', (_label, resolve) => {
    expect(resolve).toThrow(MissingTenantContextError);
    expect(resolve).toThrow('idempotency key');
  });
});

describe('setTenantResolver', () => {
  it('reads the resolver each time a tenant is required', () => {
    let tenant = 'first';
    setTenantResolver(() => tenant);
    expect(requireTenantId(undefined, 'key')).toBe('first');

    tenant = 'second';
    expect(requireTenantId(undefined, 'key')).toBe('second');
  });

  it('is replaced by a later call and removed by undefined', () => {
    setTenantResolver(() => 'first');
    setTenantResolver(() => 'second');
    expect(requireTenantId(undefined, 'key')).toBe('second');

    setTenantResolver(undefined);
    expect(() => requireTenantId(undefined, 'key')).toThrow(
      MissingTenantContextError,
    );
  });
});
