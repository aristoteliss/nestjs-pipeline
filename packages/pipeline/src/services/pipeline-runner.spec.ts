/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import { isUuidV7, uuidv7 } from '@cqrs-ddd/uuidv7';
import { describe, expect, it, vi } from 'vitest';
import { pipelineStore } from '../constants/pipeline-context.constants.js';
import type { ContextSource } from '../interfaces/context-source.interface.js';
import type { PipelineHandlerMeta } from '../interfaces/pipeline-handler-meta.interface.js';
import { createPipelineRunner } from './pipeline-runner.js';

class Request {}
class Handler {}
const meta: PipelineHandlerMeta = {
  handlerType: Handler,
  handlerName: 'Handler',
  requestKind: 'command',
};

const readContext = () => {
  const context = pipelineStore.getStore();
  return { tenantId: context?.tenantId, correlationId: context?.correlationId };
};

describe('pipeline runner', () => {
  it('passes through an unconfigured handler without constructing a pipeline context', async () => {
    const self = { result: 'done' };
    const request = new Request();
    const original = vi.fn(function (this: typeof self, received: unknown) {
      expect(received).toBe(request);
      expect(pipelineStore.getStore()).toBeUndefined();
      return this.result;
    });
    const resolve = vi.fn();
    const runner = createPipelineRunner(
      original as never,
      meta,
      resolve,
      false,
    );

    await expect(runner(self, request)).resolves.toBe('done');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('runs without a tenant and with a generated correlation id outside any pipeline', async () => {
    const runner = createPipelineRunner(readContext, meta, [], true);

    const { tenantId, correlationId } = (await runner(
      new Handler(),
      new Request(),
    )) as ReturnType<typeof readContext>;

    expect(tenantId).toBeUndefined();
    expect(isUuidV7(correlationId as string)).toBe(true);
    expect(pipelineStore.getStore()).toBeUndefined();
  });

  it('gives a nested pipeline the values of the enclosing one when no source is registered', async () => {
    const nested = createPipelineRunner(readContext, meta, [], true);
    const outer = createPipelineRunner(
      async () => ({ outer: readContext(), nested: await nested({}, {}) }),
      meta,
      [],
      true,
    );

    const result = (await outer(new Handler(), new Request())) as {
      outer: ReturnType<typeof readContext>;
      nested: ReturnType<typeof readContext>;
    };

    expect(result.nested).toEqual(result.outer);
  });
});

function source(): ContextSource {
  const store = new AsyncLocalStorage<string | undefined>();
  return {
    current: () => store.getStore(),
    run: (value, fn) => store.run(value, fn),
  };
}

describe('pipeline runner with context sources', () => {
  const tenant = source();
  const correlation = { ...source(), create: () => uuidv7() };
  const sources = { tenantId: tenant, correlationId: correlation };
  const runner = (fn: () => unknown) =>
    createPipelineRunner(fn, meta, [], true, sources);
  const readSources = () => ({
    tenantId: tenant.current(),
    correlationId: correlation.current(),
  });

  it('gives a pipeline their current values', async () => {
    await expect(
      tenant.run('tenant-a', () =>
        correlation.run('corr-1', () => runner(readContext)({}, {})),
      ),
    ).resolves.toEqual({ tenantId: 'tenant-a', correlationId: 'corr-1' });
  });

  it('hold the pipeline’s values while it runs, including a generated correlation id', async () => {
    const { context, sources: seen } = (await tenant.run('tenant-a', () =>
      runner(() => ({ context: readContext(), sources: readSources() }))(
        {},
        {},
      ),
    )) as Record<string, ReturnType<typeof readContext>>;

    expect(isUuidV7(context.correlationId as string)).toBe(true);
    expect(seen).toEqual(context);
  });

  it('give a pipeline dispatched inside a narrower run that run’s tenant', async () => {
    const nested = runner(readContext);
    const outer = runner(() => tenant.run('tenant-b', () => nested({}, {})));

    await expect(
      tenant.run('tenant-a', () => outer({}, {})),
    ).resolves.toMatchObject({ tenantId: 'tenant-b' });
  });

  it('take precedence over the enclosing pipeline, so clearing the tenant clears it', async () => {
    const nested = runner(readContext);
    const outer = runner(() => tenant.run(undefined, () => nested({}, {})));

    await expect(
      tenant.run('tenant-a', () => outer({}, {})),
    ).resolves.toMatchObject({ tenantId: undefined });
  });
});
