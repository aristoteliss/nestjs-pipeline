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
import { describe, expect, it } from 'vitest';
import type { AuditBehaviorOptions } from '../interfaces/audit-options.interface';
import { type BuildAuditRecordInput, buildAuditRecord } from './build-record';
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

  it('captures the response only when enabled and successful', () => {
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
});
