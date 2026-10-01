/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { MissingJobContextError } from '../errors/missing-job-context.error.js';
import { activeRegistration, register, unregister } from './registration.js';

const sources = {
  tenantId: {
    current: () => undefined,
    run: <T>(_v: unknown, fn: () => T) => fn(),
  },
  correlationId: {
    current: () => undefined,
    run: <T>(_v: unknown, fn: () => T) => fn(),
    accepts: () => true,
    create: () => 'created-id',
  },
};
const principal = {
  capture: () => undefined,
  restore: async <T>(_p: unknown, work: () => Promise<T>) => work(),
};

describe('job context registration', () => {
  it('fails closed when nothing is registered', () => {
    expect(() => activeRegistration()).toThrow(MissingJobContextError);
  });

  it('returns the registered principal and tenants until they are removed', () => {
    const registration = { principal, tenants: ['tenant_a'], sources };
    register(registration);

    expect(activeRegistration()).toBe(registration);
    unregister(registration);
    expect(() => activeRegistration()).toThrow(MissingJobContextError);
  });

  it('keeps a newer registration when an older one is removed', () => {
    const older = { principal, tenants: ['tenant_a'], sources };
    const newer = { principal, tenants: ['tenant_b'], sources };
    register(older);
    register(newer);

    unregister(older);

    expect(activeRegistration()).toBe(newer);
    unregister(newer);
  });
});
