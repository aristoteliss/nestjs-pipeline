import { describe, expect, it } from 'vitest';
import {
  pipelineStore,
  SET_ORIGINAL_CORRELATION_ID,
  SET_RESPONSE,
} from './constants/pipeline-context.constants';
import { PipelineHandlerMeta } from './interfaces/pipeline-handler-meta.interface';
import { PipelineContext } from './pipeline.context';

// ── Helpers ─────────────────────────────────────────────────

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

// ── PipelineContext ─────────────────────────────────────────

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

  it('originalCorrelationId is set via SET_ORIGINAL_CORRELATION_ID and is immutable to re-writes', () => {
    const ctx = new PipelineContext(new FakeCommand('x'), buildMeta());
    ctx.correlationId = 'first';
    ctx[SET_ORIGINAL_CORRELATION_ID]('first');

    // Change the mutable correlationId
    ctx.correlationId = 'second';

    expect(ctx.correlationId).toBe('second');
    expect(ctx.originalCorrelationId).toBe('first');
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
    parentCtx.correlationId = 'parent-corr-id';

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
    parentCtx.correlationId = '';

    let childCtx: PipelineContext | undefined;
    pipelineStore.run(parentCtx, () => {
      childCtx = new PipelineContext(new FakeCommand('child'), buildMeta());
    });

    expect(childCtx!.correlationId).toBe('');
  });
});

describe('PipelineContext.getBehaviorOptions', () => {
  class SomeBehavior {}

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
    const opts = new Map<string, Record<string, any>>([
      ['SomeBehavior', { level: 'debug' }],
    ]);
    const ctx = new PipelineContext(
      new FakeCommand('x'),
      buildMeta({ behaviorOptions: opts }),
    );
    expect(ctx.getBehaviorOptions(SomeBehavior)).toEqual({ level: 'debug' });
  });
});
