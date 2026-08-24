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

  it('merges handler options over module defaults (handler wins)', async () => {
    const behavior = new AuditBehavior(sink, { severity: 'low', action: 'x' });
    const ctx = withOptions(makeCtx(), { severity: 'critical' });

    await behavior.handle(ctx, vi.fn().mockResolvedValue('ok'));

    const record = lastRecord();
    expect(record.severity).toBe('critical');
    expect(record.action).toBe('x');
  });
});
