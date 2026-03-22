import { Type } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LoggingBehavior,
  LoggingBehaviorOptions,
} from '../behaviors/logging.behavior';
import { IPipelineContext } from '../interfaces/pipeline.context.interface';

function createMockContext(
  overrides: Partial<IPipelineContext> = {},
): IPipelineContext {
  return {
    correlationId: 'test-corr-id',
    originalCorrelationId: 'test-corr-id',
    request: { name: 'MockCommand' },
    requestType: class MockCommand {} as Type,
    requestName: 'MockCommand',
    handlerType: class MockHandler {} as Type,
    handlerName: 'MockHandler',
    requestKind: 'command',
    startedAt: new Date(),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn().mockReturnValue(undefined),
    ...overrides,
  };
}

describe('LoggingBehavior', () => {
  let behavior: LoggingBehavior;

  beforeEach(() => {
    behavior = new LoggingBehavior();
  });

  it('calls next() and returns its result', async () => {
    const ctx = createMockContext();
    const next = vi.fn().mockResolvedValue({ id: 1 });

    const result = await behavior.handle(ctx, next);

    expect(next).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: 1 });
  });

  it('re-throws errors from next()', async () => {
    const ctx = createMockContext();
    const next = vi.fn().mockRejectedValue(new Error('handler failed'));

    await expect(behavior.handle(ctx, next)).rejects.toThrow('handler failed');
  });

  it('reads behavior options from context', async () => {
    const opts: LoggingBehaviorOptions = {
      metricLogLevel: 'warn',
      requestResponseLogLevel: 'none',
    };
    const getBehaviorOptions = vi.fn().mockReturnValue(opts);
    const ctx = createMockContext({ getBehaviorOptions });
    const next = vi.fn().mockResolvedValue('ok');

    await behavior.handle(ctx, next);

    expect(getBehaviorOptions).toHaveBeenCalledWith(LoggingBehavior);
  });

  it('handles event handlers returning void/undefined', async () => {
    const ctx = createMockContext({ requestKind: 'event' });
    const next = vi.fn().mockResolvedValue(undefined);

    const result = await behavior.handle(ctx, next);

    expect(result).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });
});
