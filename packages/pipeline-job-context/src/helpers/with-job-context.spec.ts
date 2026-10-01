/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { MissingJobContextError } from '../errors/missing-job-context.error.js';
import type { PrincipalReference } from '../interfaces/principal-reference.interface.js';
import { register, unregister } from './registration.js';
import { withJobContext } from './with-job-context.js';

function source() {
  const store = new AsyncLocalStorage<string | undefined>();
  return {
    current: () => store.getStore(),
    run: <T>(value: string | undefined, fn: () => T) => store.run(value, fn),
  };
}
const sources = {
  tenantId: source(),
  correlationId: {
    ...source(),
    accepts: (id: string) => !id.includes(' '),
    create: () => 'created-id',
  },
};

function registerPrincipal(captured: PrincipalReference | undefined) {
  const registration = {
    principal: {
      capture: () => captured,
      restore: async <T>(_p: unknown, work: () => Promise<T>) => work(),
    },
    tenants: ['tenant_a'],
    sources,
  };
  register(registration);
  return registration;
}

describe('withJobContext', () => {
  let registration: ReturnType<typeof registerPrincipal> | undefined;

  afterEach(() => {
    if (registration) unregister(registration);
    registration = undefined;
  });

  it('stamps the tenant, correlation id and principal identity on a copy', () => {
    registration = registerPrincipal({
      id: 'u-1',
      type: 'user',
      sessionId: 's-1',
      grants: ['all|manage'],
    } as PrincipalReference);
    const data = { userId: 'u-2' };

    const stamped = sources.tenantId.run('tenant_a', () =>
      sources.correlationId.run('corr-1', () => withJobContext(data)),
    );

    expect(stamped).toEqual({
      userId: 'u-2',
      jobContext: {
        tenantId: 'tenant_a',
        correlationId: 'corr-1',
        principal: { id: 'u-1', type: 'user', sessionId: 's-1' },
      },
    });
    expect(data).toEqual({ userId: 'u-2' });
  });

  it('accepts a payload without a prototype', () => {
    registration = registerPrincipal({ id: 'svc', type: 'service' });
    const data = Object.assign(Object.create(null), { userId: 'u-2' });

    const stamped = sources.tenantId.run('tenant_a', () =>
      withJobContext(data),
    );

    expect(stamped.jobContext.principal).toEqual({
      id: 'svc',
      type: 'service',
    });
    expect(stamped.jobContext.correlationId).toEqual(expect.any(String));
  });

  it.each([
    ['an array', [1]],
    ['a class instance', new Date()],
    ['null', null],
  ])('refuses %s as the payload', (_case, data) => {
    registration = registerPrincipal({ id: 'svc', type: 'service' });

    expect(() =>
      withJobContext(data as unknown as Record<string, unknown>),
    ).toThrow(TypeError);
  });

  it('fails closed without a running module', () => {
    expect(() =>
      sources.tenantId.run('tenant_a', () => withJobContext({})),
    ).toThrow(MissingJobContextError);
  });

  it('fails closed without a tenant', () => {
    registration = registerPrincipal({ id: 'svc', type: 'service' });

    expect(() => withJobContext({})).toThrow(
      new MissingJobContextError('tenant'),
    );
  });

  it('fails closed without a principal', () => {
    registration = registerPrincipal(undefined);

    expect(() =>
      sources.tenantId.run('tenant_a', () => withJobContext({})),
    ).toThrow(new MissingJobContextError('principal'));
  });
});
