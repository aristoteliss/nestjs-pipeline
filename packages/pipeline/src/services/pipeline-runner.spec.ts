/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import {
  pipelineStore,
  SET_TENANT_ID,
} from '../constants/pipeline-context.constants';
import type { PipelineHandlerMeta } from '../interfaces/pipeline-handler-meta.interface';
import { PipelineContext } from '../pipeline.context';
import { createPipelineRunner } from './pipeline-runner';

class Request {}
class Handler {}
const meta: PipelineHandlerMeta = {
  handlerType: Handler,
  handlerName: 'Handler',
  requestKind: 'command',
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
    const factory = vi.fn();
    const runner = createPipelineRunner(
      original as never,
      meta,
      resolve,
      false,
      {
        tenantIdFactory: factory,
        correlationIdFactory: factory,
      },
    );
    await expect(runner(self, request)).resolves.toBe('done');
    expect(resolve).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });

  it.each([undefined, 'tenant-a'])(
    'uses the tenant factory result %s for the execution',
    async (tenant) => {
      const factory = vi.fn(() => tenant);
      const runner = createPipelineRunner(
        () => pipelineStore.getStore()?.tenantId,
        meta,
        [],
        true,
        { tenantIdFactory: factory },
      );
      await expect(runner(new Handler(), new Request())).resolves.toBe(tenant);
      expect(factory).toHaveBeenCalledOnce();
      expect(pipelineStore.getStore()).toBeUndefined();
    },
  );

  it('inherits a parent tenant without consulting the tenant factory', async () => {
    const parent = new PipelineContext(new Request(), meta);
    parent[SET_TENANT_ID]('parent-tenant');
    const factory = vi.fn(() => 'different-tenant');
    const runner = createPipelineRunner(
      () => pipelineStore.getStore()?.tenantId,
      meta,
      [],
      true,
      { tenantIdFactory: factory },
    );
    await expect(
      pipelineStore.run(parent, () => runner(new Handler(), new Request())),
    ).resolves.toBe('parent-tenant');
    expect(factory).not.toHaveBeenCalled();
  });
});
