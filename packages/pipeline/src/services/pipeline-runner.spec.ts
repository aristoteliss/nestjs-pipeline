/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { isUuidV7 } from '@cqrs-ddd/uuidv7';
import { describe, expect, it, vi } from 'vitest';
import { pipelineStore } from '../constants/pipeline-context.constants';
import { currentScope, runInScope } from '../execution-scope';
import type { PipelineHandlerMeta } from '../interfaces/pipeline-handler-meta.interface';
import { createPipelineRunner } from './pipeline-runner';

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

  it('takes the tenant and correlation id of the current scope', async () => {
    const runner = createPipelineRunner(readContext, meta, [], true);

    await expect(
      runInScope({ tenantId: 'tenant-a', correlationId: 'corr-1' }, () =>
        runner(new Handler(), new Request()),
      ),
    ).resolves.toEqual({ tenantId: 'tenant-a', correlationId: 'corr-1' });
    expect(pipelineStore.getStore()).toBeUndefined();
  });

  it('runs without a tenant and with a generated correlation id outside any scope', async () => {
    const runner = createPipelineRunner(readContext, meta, [], true);

    const { tenantId, correlationId } = (await runner(
      new Handler(),
      new Request(),
    )) as ReturnType<typeof readContext>;

    expect(tenantId).toBeUndefined();
    expect(isUuidV7(correlationId as string)).toBe(true);
  });

  it('runs the handler inside a scope holding the execution values, which nested runs inherit', async () => {
    const nested = createPipelineRunner(readContext, meta, [], true);
    const outer = createPipelineRunner(
      async () => ({ scope: currentScope(), nested: await nested({}, {}) }),
      meta,
      [],
      true,
    );

    const result = await runInScope({ tenantId: 'tenant-a' }, () =>
      outer(new Handler(), new Request()),
    );

    expect(result).toEqual({
      scope: { tenantId: 'tenant-a', correlationId: expect.any(String) },
      nested: {
        tenantId: 'tenant-a',
        correlationId: (result as { scope: { correlationId: string } }).scope
          .correlationId,
      },
    });
  });

  it('gives a pipeline dispatched inside a narrower scope that scope’s tenant', async () => {
    const nested = createPipelineRunner(readContext, meta, [], true);
    const outer = createPipelineRunner(
      () => runInScope({ tenantId: 'tenant-b' }, () => nested({}, {})),
      meta,
      [],
      true,
    );

    await expect(
      runInScope({ tenantId: 'tenant-a' }, () => outer({}, {})),
    ).resolves.toMatchObject({ tenantId: 'tenant-b' });
  });
});
