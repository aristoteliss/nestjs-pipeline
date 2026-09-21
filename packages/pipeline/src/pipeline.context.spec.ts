/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import {
  pipelineStore,
  SET_CORRELATION_ID,
  SET_RESPONSE,
  SET_TENANT_ID,
} from './constants/pipeline-context.constants';
import {
  type BehaviorId,
  PIPELINE_BEHAVIOR_ID,
} from './decorators/pipeline.decorator';
import type {
  IPipelineBehavior,
  NextDelegate,
} from './interfaces/pipeline.behavior.interface';
import type { IPipelineContext } from './interfaces/pipeline.context.interface';
import { PipelineHandlerMeta } from './interfaces/pipeline-handler-meta.interface';
import { PipelineContext } from './pipeline.context';

class FakeCommand {
  constructor(public readonly name: string) {}
}

class FakeHandler {
  execute(_cmd: FakeCommand) {
    return { ok: true };
  }
}

function buildMeta(
  overrides: Partial<PipelineHandlerMeta> = {},
): PipelineHandlerMeta {
  return {
    handlerType: FakeHandler,
    handlerName: 'FakeHandler',
    requestKind: 'command',
    behaviorOptions: undefined,
    ...overrides,
  };
}

describe('PipelineContext', () => {
  it('captures request and metadata', () => {
    const cmd = new FakeCommand('test');
    const ctx = new PipelineContext(cmd, buildMeta());

    expect(ctx.request).toBe(cmd);
    expect(ctx.requestType).toBe(FakeCommand);
    expect(ctx.requestName).toBe('FakeCommand');
    expect(ctx.handlerType).toBe(FakeHandler);
    expect(ctx.handlerName).toBe('FakeHandler');
    expect(ctx.requestKind).toBe('command');
  });

  it('initialises startedAt and items', () => {
    const before = new Date();
    const ctx = new PipelineContext(new FakeCommand('x'), buildMeta());

    expect(ctx.startedAt).toBeInstanceOf(Date);
    expect(ctx.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(ctx.items).toBeInstanceOf(Map);
    expect(ctx.items.size).toBe(0);
  });

  it('response is initially undefined', () => {
    const ctx = new PipelineContext(new FakeCommand('x'), buildMeta());
    expect(ctx.response).toBeUndefined();
  });

  it('response can be set via SET_RESPONSE symbol', () => {
    const ctx = new PipelineContext(new FakeCommand('x'), buildMeta());
    ctx[SET_RESPONSE]({ result: 42 });
    expect(ctx.response).toEqual({ result: 42 });
  });

  it('sets correlationId only through the internal setter before execution', () => {
    const ctx = new PipelineContext(new FakeCommand('x'), buildMeta());
    ctx[SET_CORRELATION_ID]('first');

    expect(() => {
      (ctx as unknown as { correlationId: string }).correlationId = 'second';
    }).toThrow();
    expect(ctx.correlationId).toBe('first');
  });

  it('correlationId defaults to empty string (no parent context)', () => {
    const ctx = new PipelineContext(new FakeCommand('x'), buildMeta());
    expect(ctx.correlationId).toBe('');
  });

  it('inherits correlationId from parent pipeline store', () => {
    const parentCtx = new PipelineContext(
      new FakeCommand('parent'),
      buildMeta(),
    );
    parentCtx[SET_CORRELATION_ID]('parent-corr-id');

    let childCtx: PipelineContext | undefined;
    pipelineStore.run(parentCtx, () => {
      childCtx = new PipelineContext(new FakeCommand('child'), buildMeta());
    });

    expect(childCtx!.correlationId).toBe('parent-corr-id');
  });

  it('does not inherit from parent when parent correlationId is empty', () => {
    const parentCtx = new PipelineContext(
      new FakeCommand('parent'),
      buildMeta(),
    );
    parentCtx[SET_CORRELATION_ID]('');

    let childCtx: PipelineContext | undefined;
    pipelineStore.run(parentCtx, () => {
      childCtx = new PipelineContext(new FakeCommand('child'), buildMeta());
    });

    expect(childCtx!.correlationId).toBe('');
  });

  it('tenantId defaults to undefined', () => {
    const ctx = new PipelineContext(new FakeCommand('x'), buildMeta());
    expect(ctx.tenantId).toBeUndefined();
  });

  it('sets tenantId via SET_TENANT_ID', () => {
    const ctx = new PipelineContext(new FakeCommand('x'), buildMeta());
    ctx[SET_TENANT_ID]('tenant-123');

    expect(ctx.tenantId).toBe('tenant-123');
    expect(() => {
      (ctx as unknown as { tenantId: string }).tenantId = 'other';
    }).toThrow();
  });

  it('inherits tenantId from parent pipeline store', () => {
    const parentCtx = new PipelineContext(
      new FakeCommand('parent'),
      buildMeta(),
    );
    parentCtx[SET_TENANT_ID]('tenant-parent');

    let childCtx: PipelineContext | undefined;
    pipelineStore.run(parentCtx, () => {
      childCtx = new PipelineContext(new FakeCommand('child'), buildMeta());
    });

    expect(childCtx!.tenantId).toBe('tenant-parent');
  });

  it('does not set tenantId when parent tenantId is undefined', () => {
    const parentCtx = new PipelineContext(
      new FakeCommand('parent'),
      buildMeta(),
    );

    let childCtx: PipelineContext | undefined;
    pipelineStore.run(parentCtx, () => {
      childCtx = new PipelineContext(new FakeCommand('child'), buildMeta());
    });

    expect(childCtx!.tenantId).toBeUndefined();
  });
});

describe('PipelineContext.getBehaviorOptions', () => {
  class SomeBehavior implements IPipelineBehavior {
    async handle(_ctx: IPipelineContext, next: NextDelegate) {
      return next();
    }
  }

  it('returns undefined when no options map exists', () => {
    const ctx = new PipelineContext(
      new FakeCommand('x'),
      buildMeta({ behaviorOptions: undefined }),
    );
    expect(ctx.getBehaviorOptions(SomeBehavior)).toBeUndefined();
  });

  it('returns undefined when behavior has no options', () => {
    const opts = new Map<string, Record<string, any>>();
    const ctx = new PipelineContext(
      new FakeCommand('x'),
      buildMeta({ behaviorOptions: opts }),
    );
    expect(ctx.getBehaviorOptions(SomeBehavior)).toBeUndefined();
  });

  it('returns options for a registered behavior', () => {
    const opts = new Map<BehaviorId, Record<string, any>>([
      [SomeBehavior, { level: 'debug' }],
    ]);
    const ctx = new PipelineContext(
      new FakeCommand('x'),
      buildMeta({ behaviorOptions: opts }),
    );
    expect(ctx.getBehaviorOptions(SomeBehavior)).toEqual({ level: 'debug' });
  });

  it('uses PIPELINE_BEHAVIOR_ID when a behavior defines a custom identity', () => {
    class CustomIdBehavior {
      static readonly [PIPELINE_BEHAVIOR_ID] = 'pkg:custom-behavior';
    }

    const opts = new Map<string, Record<string, any>>([
      ['pkg:custom-behavior', { level: 'trace' }],
    ]);
    const ctx = new PipelineContext(
      new FakeCommand('x'),
      buildMeta({ behaviorOptions: opts }),
    );

    expect(ctx.getBehaviorOptions(CustomIdBehavior)).toEqual({
      level: 'trace',
    });
  });

  it('clears tenantId when SET_TENANT_ID is called with undefined', () => {
    const ctx = new PipelineContext(new FakeCommand('x'), buildMeta());
    ctx[SET_TENANT_ID]('initial-tenant');
    expect(ctx.tenantId).toBe('initial-tenant');

    ctx[SET_TENANT_ID](undefined);
    expect(ctx.tenantId).toBeUndefined();
  });
});
