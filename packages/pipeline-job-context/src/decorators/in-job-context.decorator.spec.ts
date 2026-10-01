/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidJobContextError } from '../errors/invalid-job-context.error.js';
import { MissingJobContextError } from '../errors/missing-job-context.error.js';
import { register, unregister } from '../helpers/registration.js';
import type { IJobPrincipal } from '../interfaces/job-principal.interface.js';
import type { PrincipalReference } from '../interfaces/principal-reference.interface.js';
import { InJobContext } from './in-job-context.decorator.js';

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

const jobContext = {
  tenantId: 'tenant_a',
  correlationId: 'corr-job',
  principal: { id: 'u-1', type: 'user', sessionId: 's-1' },
};

let bound: PrincipalReference | undefined;
const restore = vi.fn(
  async <T>(principal: PrincipalReference, work: () => Promise<T>) => {
    bound = principal;
    try {
      return await work();
    } finally {
      bound = undefined;
    }
  },
);
const registration = {
  principal: { capture: () => undefined, restore } as IJobPrincipal,
  tenants: ['tenant_a'],
  sources,
};

class Processor {
  readonly seen: unknown[] = [];

  @InJobContext()
  async process(job: { data: unknown }) {
    this.seen.push(job);
    return {
      tenant: sources.tenantId.current(),
      correlationId: sources.correlationId.current(),
      principal: bound,
    };
  }

  @InJobContext({ path: 'jobContext' })
  async handle(_message: unknown) {
    return sources.tenantId.current();
  }
}

describe('InJobContext', () => {
  beforeEach(() => register(registration));
  afterEach(() => {
    unregister(registration);
    restore.mockClear();
  });

  it('runs the method in the payload tenant, correlation id and restored principal', async () => {
    const processor = new Processor();
    const job = { data: { userId: 'u-2', jobContext } };

    await expect(processor.process(job)).resolves.toEqual({
      tenant: 'tenant_a',
      correlationId: 'corr-job',
      principal: jobContext.principal,
    });
    expect(processor.seen).toEqual([job]);
    expect(restore).toHaveBeenCalledWith(
      jobContext.principal,
      expect.any(Function),
    );
  });

  it('reads the context from a custom path', async () => {
    await expect(new Processor().handle({ jobContext })).resolves.toBe(
      'tenant_a',
    );
  });

  it('keeps the method name', () => {
    expect(Processor.prototype.process.name).toBe('process');
  });

  it('refuses a payload without a context before the method runs', async () => {
    const processor = new Processor();

    await expect(processor.process({ data: {} })).rejects.toBeInstanceOf(
      MissingJobContextError,
    );
    await expect(
      processor.process(undefined as unknown as { data: unknown }),
    ).rejects.toBeInstanceOf(MissingJobContextError);
    expect(processor.seen).toEqual([]);
    expect(restore).not.toHaveBeenCalled();
  });

  it('refuses a principal that carries grants', async () => {
    const processor = new Processor();
    const forged = {
      ...jobContext,
      principal: { ...jobContext.principal, grants: ['all|manage'] },
    };

    await expect(
      processor.process({ data: { jobContext: forged } }),
    ).rejects.toBeInstanceOf(InvalidJobContextError);
    expect(processor.seen).toEqual([]);
  });

  it('does not run the method when the principal is refused', async () => {
    const processor = new Processor();
    restore.mockRejectedValueOnce(new Error('session revoked'));

    await expect(processor.process({ data: { jobContext } })).rejects.toThrow(
      'session revoked',
    );
    expect(processor.seen).toEqual([]);
  });

  it('fails closed without a running module', async () => {
    unregister(registration);

    await expect(
      new Processor().process({ data: { jobContext } }),
    ).rejects.toBeInstanceOf(MissingJobContextError);
  });
});
