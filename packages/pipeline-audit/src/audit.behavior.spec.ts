/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type IPipelineContext,
  PIPELINE_BEHAVIOR_CONTRACT,
  type PipelineBehaviorValidationContext,
} from '@nestjs-pipeline/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_RECORD_ITEM, AuditBehavior } from './audit.behavior';
import type { AuditBehaviorOptions } from './interfaces/audit-options.interface';
import type { AuditRecord } from './interfaces/audit-record.interface';
import type { AuditSink } from './interfaces/audit-sink.interface';

const write = vi.fn();
const sink: AuditSink = { write };

function makeCtx(overrides: Partial<IPipelineContext> = {}): IPipelineContext {
  return {
    correlationId: 'corr-123',
    request: { username: 'jane', password: 'hunter2' },
    requestType: class CreateUserCommand {},
    requestName: 'CreateUserCommand',
    handlerType: class CreateUserHandler {},
    handlerName: 'CreateUserHandler',
    requestKind: 'command',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn().mockReturnValue(undefined),
    ...overrides,
  } as unknown as IPipelineContext;
}

function withOptions(
  ctx: IPipelineContext,
  options: AuditBehaviorOptions,
): IPipelineContext {
  vi.mocked(ctx.getBehaviorOptions).mockReturnValue(
    options as unknown as ReturnType<IPipelineContext['getBehaviorOptions']>,
  );
  return ctx;
}

const lastRecord = (): AuditRecord =>
  write.mock.calls[write.mock.calls.length - 1]?.[0] as AuditRecord;

describe('AuditBehavior', () => {
  beforeEach(() => {
    write.mockReset();
  });

  it('does not mutate a shared logger and supplies its context per call', async () => {
    const logger = {
      warn: vi.fn(),
      error: vi.fn(),
      setContext: vi.fn(),
    };
    const failingSink: AuditSink = {
      write: vi.fn().mockRejectedValue(new Error('sink unavailable')),
    };
    const behavior = new AuditBehavior(failingSink, undefined, logger as never);

    await behavior.handle(makeCtx(), vi.fn().mockResolvedValue('ok'));

    expect(logger.setContext).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('failing open'),
      AuditBehavior.name,
    );
  });

  it('returns the handler result when the sink and the diagnostic logger both fail with failOpen', async () => {
    const logger = {
      warn: vi.fn(() => {
        throw new Error('logger down');
      }),
      error: vi.fn(() => {
        throw new Error('logger down');
      }),
    };
    const failingSink: AuditSink = {
      write: vi.fn().mockRejectedValue(new Error('sink unavailable')),
    };
    const behavior = new AuditBehavior(failingSink, undefined, logger as never);

    await expect(
      behavior.handle(makeCtx(), vi.fn().mockResolvedValue('committed')),
    ).resolves.toBe('committed');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('keeps the business error when recording and logging fail after it', async () => {
    const logger = {
      error: vi.fn(() => {
        throw new Error('logger down');
      }),
    };
    const failingSink: AuditSink = {
      write: vi.fn().mockRejectedValue(new Error('sink unavailable')),
    };
    const behavior = new AuditBehavior(failingSink, undefined, logger as never);
    const businessError = new Error('business failure');

    await expect(
      behavior.handle(makeCtx(), vi.fn().mockRejectedValue(businessError)),
    ).rejects.toBe(businessError);
  });

  it('reports a non-function factory option as a bootstrap diagnostic', () => {
    const validate = AuditBehavior[PIPELINE_BEHAVIOR_CONTRACT].validate;
    const validation = (effectiveOptions: Record<string, unknown>) =>
      ({
        handlerName: 'DeleteUserHandler',
        effectiveOptions,
      }) as unknown as PipelineBehaviorValidationContext;

    expect(validate?.(validation({ metadata: 'not-a-function' }))).toEqual([
      expect.objectContaining({
        handlerName: 'DeleteUserHandler',
        behaviorName: 'AuditBehavior',
        message: expect.stringContaining('Invalid audit metadata factory'),
      }),
    ]);
    expect(validate?.(validation({ actor: () => ({ id: 'u1' }) }))).toBe(
      undefined,
    );
  });

  it('merges module defaults into the options seen by bootstrap diagnostics', () => {
    const behavior = new AuditBehavior(sink, {
      actor: 'not-a-function' as never,
    });

    expect(behavior.resolveEffectiveOptions({ action: 'x' })).toEqual({
      actor: 'not-a-function',
      action: 'x',
    });
  });

  it('writes a success record with redacted payload and passes the response through', async () => {
    const behavior = new AuditBehavior(sink);
    const next = vi.fn().mockResolvedValue({ id: 'u1' });

    const result = await behavior.handle(makeCtx(), next);

    expect(result).toEqual({ id: 'u1' });
    expect(write).toHaveBeenCalledTimes(1);
    const record = lastRecord();
    expect(record).toMatchObject({
      correlationId: 'corr-123',
      action: 'CreateUserCommand',
      severity: 'medium',
      outcome: 'success',
      requestKind: 'command',
      requestName: 'CreateUserCommand',
      handlerName: 'CreateUserHandler',
      payload: { username: 'jane', password: '[REDACTED]' },
    });
    expect(record.id).toBeTypeOf('string');
    expect(record.durationMs).toBeTypeOf('number');
    expect(record.response).toBeUndefined();
    expect(record.error).toBeUndefined();
  });

  it('writes a failure record then re-throws', async () => {
    const behavior = new AuditBehavior(sink);
    const ctx = makeCtx();
    const boom = new TypeError('denied');

    await expect(
      behavior.handle(ctx, vi.fn().mockRejectedValue(boom)),
    ).rejects.toBe(boom);

    expect(write).toHaveBeenCalledTimes(1);
    const record = lastRecord();
    expect(record.outcome).toBe('failure');
    expect(record.error).toMatchObject({
      name: 'TypeError',
      message: 'denied',
    });
    expect(record.error?.stack).toBeTypeOf('string');
    expect(ctx.items.get(AUDIT_RECORD_ITEM)).toBe(record);
  });

  it('records throw undefined as a failure', async () => {
    const behavior = new AuditBehavior(sink);

    await expect(
      behavior.handle(makeCtx(), vi.fn().mockRejectedValue(undefined)),
    ).rejects.toBeUndefined();

    expect(lastRecord()).toMatchObject({
      outcome: 'failure',
      error: { name: 'unknown', message: 'undefined' },
    });
  });

  it('captures the response when captureResponse=true', async () => {
    const behavior = new AuditBehavior(sink);
    const ctx = withOptions(makeCtx(), { captureResponse: true });

    await behavior.handle(ctx, vi.fn().mockResolvedValue({ token: 'abc' }));

    expect(lastRecord().response).toEqual({ token: '[REDACTED]' });
  });

  it('omits the payload when captureRequest=false', async () => {
    const behavior = new AuditBehavior(sink);
    const ctx = withOptions(makeCtx(), { captureRequest: false });

    await behavior.handle(ctx, vi.fn().mockResolvedValue('ok'));

    expect(lastRecord().payload).toBeUndefined();
  });

  it('applies action, severity, actor, and metadata from options', async () => {
    const behavior = new AuditBehavior(sink);
    const ctx = withOptions(
      makeCtx({ items: new Map([['currentUserId', 'admin-1']]) }),
      {
        action: 'user.create',
        severity: 'high',
        actor: (c) => ({ id: c.items.get('currentUserId') as string }),
        metadata: (c) => ({ kind: c.requestKind }),
      },
    );

    await behavior.handle(ctx, vi.fn().mockResolvedValue('ok'));

    const record = lastRecord();
    expect(record.action).toBe('user.create');
    expect(record.severity).toBe('high');
    expect(record.actor).toEqual({ id: 'admin-1' });
    expect(record.metadata).toEqual({ kind: 'command' });
  });

  it('defaults severity to low for queries', async () => {
    const behavior = new AuditBehavior(sink);

    await behavior.handle(
      makeCtx({ requestKind: 'query', requestName: 'GetUserQuery' }),
      vi.fn().mockResolvedValue('ok'),
    );

    expect(lastRecord().severity).toBe('low');
  });

  it('honors extra redactKeys merged with the defaults', async () => {
    const behavior = new AuditBehavior(sink);
    const ctx = withOptions(
      makeCtx({ request: { ssn: '123', custom: 'x', password: 'p' } }),
      { redactKeys: ['custom'] },
    );

    await behavior.handle(ctx, vi.fn().mockResolvedValue('ok'));

    expect(lastRecord().payload).toEqual({
      ssn: '[REDACTED]',
      custom: '[REDACTED]',
      password: '[REDACTED]',
    });
  });

  it('skips request kinds not in captureKinds', async () => {
    const behavior = new AuditBehavior(sink);
    const ctx = withOptions(makeCtx({ requestKind: 'query' }), {
      captureKinds: ['command', 'event'],
    });
    const next = vi.fn().mockResolvedValue('ok');

    const result = await behavior.handle(ctx, next);

    expect(result).toBe('ok');
    expect(write).not.toHaveBeenCalled();
  });

  it('fails open when the sink throws (default)', async () => {
    write.mockRejectedValueOnce(new Error('audit db down'));
    const behavior = new AuditBehavior(sink);

    const result = await behavior.handle(
      makeCtx(),
      vi.fn().mockResolvedValue('ok'),
    );

    expect(result).toBe('ok');
  });

  it('fails closed when failOpen=false and the sink throws', async () => {
    const sinkError = new Error('audit db down');
    write.mockRejectedValueOnce(sinkError);
    const behavior = new AuditBehavior(sink);
    const ctx = withOptions(makeCtx(), { failOpen: false });

    await expect(
      behavior.handle(ctx, vi.fn().mockResolvedValue('ok')),
    ).rejects.toBe(sinkError);
  });

  it('does not turn a successful handler into a failure audit when a fail-closed sink throws', async () => {
    const sinkError = new Error('audit db down');
    write.mockRejectedValueOnce(sinkError);
    const behavior = new AuditBehavior(sink);
    const ctx = withOptions(makeCtx(), { failOpen: false });
    const next = vi.fn().mockResolvedValue('ok');

    await expect(behavior.handle(ctx, next)).rejects.toBe(sinkError);

    expect(next).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(lastRecord().outcome).toBe('success');
  });

  it('attaches recordError as cause when failOpen=false and primary error is extensible', async () => {
    const sinkError = new Error('sink recording failed');
    write.mockRejectedValueOnce(sinkError);
    const behavior = new AuditBehavior(sink);
    const ctx = withOptions(makeCtx(), { failOpen: false });

    const standardError = new Error('primary handler error');
    const next = vi.fn().mockRejectedValue(standardError);

    await expect(behavior.handle(ctx, next)).rejects.toBe(standardError);
    expect((standardError as any).cause).toBe(sinkError);
  });

  it('attaches normalized Error cause when failOpen=false and sink throws a non-Error string', async () => {
    write.mockRejectedValueOnce('raw string sink failure');
    const behavior = new AuditBehavior(sink);
    const ctx = withOptions(makeCtx(), { failOpen: false });

    const standardError = new Error('primary handler error');
    const next = vi.fn().mockRejectedValue(standardError);

    await expect(behavior.handle(ctx, next)).rejects.toBe(standardError);
    expect((standardError as any).cause).toBeInstanceOf(Error);
    expect((standardError as any).cause.message).toBe(
      'raw string sink failure',
    );
  });

  it('does not overwrite existing cause on primary error when audit fails closed', async () => {
    const sinkError = new Error('sink recording failed');
    write.mockRejectedValueOnce(sinkError);
    const behavior = new AuditBehavior(sink);
    const ctx = withOptions(makeCtx(), { failOpen: false });

    const originalCause = new Error('root db cause');
    const standardError = new Error('primary handler error');
    (standardError as any).cause = originalCause;
    const next = vi.fn().mockRejectedValue(standardError);

    await expect(behavior.handle(ctx, next)).rejects.toBe(standardError);
    expect((standardError as any).cause).toBe(originalCause);
  });

  it('does not throw TypeError when setting cause on a frozen or non-extensible Error', async () => {
    const sinkError = new Error('sink recording failed');
    write.mockRejectedValueOnce(sinkError);
    const behavior = new AuditBehavior(sink);
    const ctx = withOptions(makeCtx(), { failOpen: false });

    const frozenError = Object.freeze(new Error('primary handler error'));
    const next = vi.fn().mockRejectedValue(frozenError);

    await expect(behavior.handle(ctx, next)).rejects.toBe(frozenError);
  });

  it('merges handler options over module defaults (handler wins)', async () => {
    const behavior = new AuditBehavior(sink, { severity: 'low', action: 'x' });
    const ctx = withOptions(makeCtx(), { severity: 'critical' });

    await behavior.handle(ctx, vi.fn().mockResolvedValue('ok'));

    const record = lastRecord();
    expect(record.severity).toBe('critical');
    expect(record.action).toBe('x');
  });

  describe('record-construction failure and factory validation guarantees', () => {
    it('fails closed when failOpen=false and actor factory throws', async () => {
      const actorError = new Error(
        'failed to resolve actor from identity provider',
      );
      const behavior = new AuditBehavior(sink);
      const ctx = withOptions(makeCtx(), {
        failOpen: false,
        actor: () => {
          throw actorError;
        },
      });

      await expect(
        behavior.handle(ctx, vi.fn().mockResolvedValue('ok')),
      ).rejects.toBe(actorError);
      expect(write).not.toHaveBeenCalled();
    });

    it('fails closed when failOpen=false and metadata factory throws', async () => {
      const metaError = new Error('metadata extraction failed');
      const behavior = new AuditBehavior(sink);
      const ctx = withOptions(makeCtx(), {
        failOpen: false,
        metadata: () => {
          throw metaError;
        },
      });

      await expect(
        behavior.handle(ctx, vi.fn().mockResolvedValue('ok')),
      ).rejects.toBe(metaError);
      expect(write).not.toHaveBeenCalled();
    });

    it('fails closed when failOpen=false and custom redactor throws', async () => {
      const redactorError = new Error('redaction error');
      const behavior = new AuditBehavior(sink);
      const ctx = withOptions(makeCtx(), {
        failOpen: false,
        redact: () => {
          throw redactorError;
        },
      });

      await expect(
        behavior.handle(ctx, vi.fn().mockResolvedValue('ok')),
      ).rejects.toBe(redactorError);
      expect(write).not.toHaveBeenCalled();
    });

    it('fails open when failOpen=true (default) and actor factory throws', async () => {
      const behavior = new AuditBehavior(sink);
      const ctx = withOptions(makeCtx(), {
        actor: () => {
          throw new Error('failed to resolve actor');
        },
      });

      const result = await behavior.handle(
        ctx,
        vi.fn().mockResolvedValue('ok'),
      );
      expect(result).toBe('ok');
      expect(write).not.toHaveBeenCalled();
    });

    it('validates that factory options are functions before execution when failOpen=false', async () => {
      const behavior = new AuditBehavior(sink);
      const ctxActor = withOptions(makeCtx(), {
        failOpen: false,
        actor: 'not-a-function' as any,
      });
      await expect(
        behavior.handle(ctxActor, vi.fn().mockResolvedValue('ok')),
      ).rejects.toThrow(/Invalid audit actor factory/);

      const ctxMeta = withOptions(makeCtx(), {
        failOpen: false,
        metadata: 'not-a-function' as any,
      });
      await expect(
        behavior.handle(ctxMeta, vi.fn().mockResolvedValue('ok')),
      ).rejects.toThrow(/Invalid audit metadata factory/);

      const ctxRedact = withOptions(makeCtx(), {
        failOpen: false,
        redact: 'not-a-function' as any,
      });
      await expect(
        behavior.handle(ctxRedact, vi.fn().mockResolvedValue('ok')),
      ).rejects.toThrow(/Invalid audit redactor/);
    });

    it('warns and continues when factory options are invalid and failOpen=true', async () => {
      const logger = { warn: vi.fn(), error: vi.fn(), log: vi.fn() };
      const behavior = new AuditBehavior(sink, undefined, logger as any);

      const ctx = withOptions(makeCtx(), {
        failOpen: true,
        actor: 'not-a-function' as any,
        metadata: 123 as any,
        redact: true as any,
      });

      const result = await behavior.handle(
        ctx,
        vi.fn().mockResolvedValue('ok'),
      );
      expect(result).toBe('ok');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('failing open'),
        'AuditBehavior',
      );
    });
  });
});
