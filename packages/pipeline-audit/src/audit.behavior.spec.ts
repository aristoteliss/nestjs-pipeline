/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_RECORD_ITEM, AuditBehavior } from './audit.behavior';
import type { AuditBehaviorOptions } from './interfaces/audit-options.interface';
import type { AuditRecord } from './interfaces/audit-record.interface';
import type { AuditSink } from './interfaces/audit-sink.interface';

// ─── Doubles ──────────────────────────────────────────────────────────────────

const write = vi.fn();
const sink: AuditSink = { write };

function makeCtx(overrides: Partial<IPipelineContext> = {}): IPipelineContext {
  return {
    correlationId: 'corr-123',
    originalCorrelationId: 'corr-123',
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

// ─── Tests ────────────────────────────────────────────────────────────────────

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
      const ctx = withOptions(makeCtx(), {
        failOpen: false,
        actor: 'not-a-function' as any,
      });

      await expect(
        behavior.handle(ctx, vi.fn().mockResolvedValue('ok')),
      ).rejects.toThrow(TypeError);
    });
  });
});
