/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MissingJobContextError } from '../errors/missing-job-context.error.js';
import { register, unregister } from '../helpers/registration.js';
import type { IJobPrincipal } from '../interfaces/job-principal.interface.js';
import type { PrincipalReference } from '../interfaces/principal-reference.interface.js';
import { AsSystem } from './as-system.decorator.js';

function source() {
  const store = new AsyncLocalStorage<string | undefined>();
  return {
    current: () => store.getStore(),
    run: <T>(value: string | undefined, fn: () => T) => store.run(value, fn),
  };
}
let created = 0;
const sources = {
  tenantId: source(),
  correlationId: {
    ...source(),
    accepts: (id: string) => !id.includes(' '),
    create: () => `created-${++created}`,
  },
};

const restore = vi.fn(
  async <T>(
    _principal: PrincipalReference,
    work: () => Promise<T>,
    _grants?: readonly unknown[],
  ) => work(),
);
const registration = {
  principal: { capture: () => undefined, restore } as IJobPrincipal,
  tenants: ['tenant_a', 'tenant_b'],
  sources,
};

class Cleanup {
  readonly runs: { tenant?: string; correlationId?: string }[] = [];

  @AsSystem({
    principal: {
      id: 'cleanup',
      type: 'service',
      extra: true,
    } as PrincipalReference,
    grants: ['Auth|delete'],
  })
  async purge() {
    if (
      sources.tenantId.current() === 'tenant_a' &&
      this.failIn === 'tenant_a'
    ) {
      throw new Error('tenant_a failed');
    }
    this.runs.push({
      tenant: sources.tenantId.current(),
      correlationId: sources.correlationId.current(),
    });
    return 'ignored';
  }

  constructor(private readonly failIn?: string) {}
}

describe('AsSystem', () => {
  beforeEach(() => register(registration));
  afterEach(() => {
    unregister(registration);
    restore.mockClear();
  });

  it('runs once per tenant with a new correlation id and the declared principal and grants', async () => {
    const cleanup = new Cleanup();

    await expect(cleanup.purge()).resolves.toBeUndefined();

    expect(cleanup.runs.map((run) => run.tenant)).toEqual([
      'tenant_a',
      'tenant_b',
    ]);
    expect(cleanup.runs[0].correlationId).not.toBe(
      cleanup.runs[1].correlationId,
    );
    expect(restore).toHaveBeenCalledTimes(2);
    expect(restore).toHaveBeenCalledWith(
      { id: 'cleanup', type: 'service' },
      expect.any(Function),
      ['Auth|delete'],
    );
  });

  it('keeps the method name', () => {
    expect(Cleanup.prototype.purge.name).toBe('purge');
  });

  it('runs the remaining tenants after one fails, then rejects with the failures', async () => {
    const cleanup = new Cleanup('tenant_a');

    const error = await cleanup.purge().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).message).toBe(
      'System work failed in tenants: tenant_a',
    );
    expect((error as AggregateError).errors).toEqual([
      new Error('tenant_a failed'),
    ]);
    expect(cleanup.runs.map((run) => run.tenant)).toEqual(['tenant_b']);
  });

  it('fails closed without a running module', async () => {
    unregister(registration);

    await expect(new Cleanup().purge()).rejects.toBeInstanceOf(
      MissingJobContextError,
    );
  });
});
