/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import type { AuditBehaviorOptions } from '../interfaces/audit-options.interface';
import {
  type BuildAuditRecordInput,
  buildAuditRecord,
  buildAuditStartRecord,
} from './build-record';
import { REDACTED } from './redact';

function makeContext(
  overrides: Partial<IPipelineContext> = {},
): IPipelineContext {
  return {
    correlationId: 'corr-123',
    requestKind: 'command',
    requestName: 'CreateUserCommand',
    handlerName: 'CreateUserHandler',
    request: { username: 'jane', password: 'hunter2' },
    ...overrides,
  } as IPipelineContext;
}

function makeInput(
  overrides: Partial<BuildAuditRecordInput> = {},
): BuildAuditRecordInput {
  return {
    context: makeContext(),
    options: {},
    failed: false,
    durationMs: 12.5,
    startedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildAuditRecord', () => {
  it('builds a success record with sensible defaults', () => {
    const record = buildAuditRecord(makeInput());

    expect(record).toMatchObject({
      correlationId: 'corr-123',
      action: 'CreateUserCommand', // defaults to requestName
      outcome: 'success',
      severity: 'medium', // default for commands
      requestKind: 'command',
      requestName: 'CreateUserCommand',
      handlerName: 'CreateUserHandler',
      durationMs: 12.5,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(typeof record.id).toBe('string');
    expect(record.id.length).toBeGreaterThan(0);
  });

  it('defaults severity to low for queries', () => {
    const record = buildAuditRecord(
      makeInput({ context: makeContext({ requestKind: 'query' }) }),
    );

    expect(record.severity).toBe('low');
  });

  it('honors explicit action and severity options', () => {
    const options: AuditBehaviorOptions = {
      action: 'user.delete',
      severity: 'high',
    };

    const record = buildAuditRecord(makeInput({ options }));

    expect(record).toMatchObject({ action: 'user.delete', severity: 'high' });
  });

  it('captures and redacts the request payload by default', () => {
    const record = buildAuditRecord(makeInput());

    expect(record.payload).toEqual({ username: 'jane', password: REDACTED });
  });

  it('omits the payload when captureRequest is false', () => {
    const record = buildAuditRecord(
      makeInput({ options: { captureRequest: false } }),
    );

    expect(record.payload).toBeUndefined();
  });

  it('captures the redacted response when captureResponse is enabled', () => {
    const record = buildAuditRecord(
      makeInput({
        options: { captureResponse: true },
        response: { id: 'u-1', token: 'secret' },
      }),
    );

    expect(record.response).toEqual({ id: 'u-1', token: REDACTED });
  });

  it('omits the response by default', () => {
    const record = buildAuditRecord(makeInput({ response: { id: 'u-1' } }));

    expect(record.response).toBeUndefined();
  });

  it('records a failure outcome and normalizes an Error', () => {
    const error = new Error('boom');

    const record = buildAuditRecord(makeInput({ error, failed: true }));

    expect(record.outcome).toBe('failure');
    expect(record.response).toBeUndefined();
    expect(record.error).toMatchObject({ name: 'Error', message: 'boom' });
    expect(record.error?.stack).toBeDefined();
  });

  it('omits the stack when includeStack is false', () => {
    const record = buildAuditRecord(
      makeInput({
        error: new Error('boom'),
        failed: true,
        options: { includeStack: false },
      }),
    );

    expect(record.error?.stack).toBeUndefined();
  });

  it('normalizes a non-Error throw', () => {
    const record = buildAuditRecord(
      makeInput({ error: 'just a string', failed: true }),
    );

    expect(record.error).toEqual({
      name: 'unknown',
      message: 'just a string',
      stack: undefined,
    });
  });

  it('resolves actor and metadata from the option callbacks', () => {
    const record = buildAuditRecord(
      makeInput({
        options: {
          actor: (ctx) => ({ id: ctx.correlationId }),
          metadata: () => ({ region: 'eu' }),
        },
      }),
    );

    expect(record.actor).toEqual({ id: 'corr-123' });
    expect(record.metadata).toEqual({ region: 'eu' });
  });

  it('uses a custom redact function over key masking', () => {
    const record = buildAuditRecord(
      makeInput({ options: { redact: () => '<masked>' } }),
    );

    expect(record.payload).toBe('<masked>');
  });

  it('captures tenantId on the record and preserves it in metadata', () => {
    const record = buildAuditRecord(
      makeInput({
        context: makeContext({ tenantId: 'tenant-42' }),
      }),
    );

    expect(record.tenantId).toBe('tenant-42');
    expect(record.metadata).toEqual({ tenantId: 'tenant-42' });
  });
});

describe('buildAuditStartRecord', () => {
  it('builds a pending record with the fields known before the handler runs', () => {
    const record = buildAuditStartRecord({
      context: makeContext(),
      options: { action: 'user.create' },
      id: 'rec-1',
      startedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(record).toEqual({
      id: 'rec-1',
      correlationId: 'corr-123',
      tenantId: undefined,
      action: 'user.create',
      severity: 'medium',
      actor: undefined,
      requestKind: 'command',
      requestName: 'CreateUserCommand',
      handlerName: 'CreateUserHandler',
      timestamp: '2026-01-01T00:00:00.000Z',
      metadata: undefined,
      payload: { username: 'jane', password: REDACTED },
      outcome: 'pending',
    });
  });

  it('shares its id with the final record built from it', () => {
    const start = buildAuditStartRecord({
      context: makeContext(),
      options: {},
      startedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(buildAuditRecord(makeInput({ id: start.id })).id).toBe(start.id);
  });
});
