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
import { buildDeadLetterRecord } from './build-record';

describe('buildDeadLetterRecord', () => {
  const mockContext: IPipelineContext = {
    correlationId: 'corr-123',
    originalCorrelationId: 'corr-123',
    request: { userId: 'u1' },
    requestType: class TestRequest { },
    requestName: 'CreateUserCommand',
    handlerType: class TestHandler { },
    handlerName: 'CreateUserHandler',
    requestKind: 'command',
    startedAt: new Date(),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: () => undefined,
  };

  it('builds record from Error instance including stack trace by default', () => {
    const error = new Error('database connection failed');
    const record = buildDeadLetterRecord(mockContext, error);

    expect(record.correlationId).toBe('corr-123');
    expect(record.requestKind).toBe('command');
    expect(record.requestName).toBe('CreateUserCommand');
    expect(record.handlerName).toBe('CreateUserHandler');
    expect(record.payload).toEqual({ userId: 'u1' });
    expect(record.error.name).toBe('Error');
    expect(record.error.message).toBe('database connection failed');
    expect(record.error.stack).toBeDefined();
    expect(record.failedAt).toBeDefined();
  });

  it('omits stack trace when includeStack is false', () => {
    const error = new Error('validation error');
    const record = buildDeadLetterRecord(mockContext, error, { includeStack: false });

    expect(record.error.message).toBe('validation error');
    expect(record.error.stack).toBeUndefined();
  });

  it('normalizes non-Error thrown values to name "unknown"', () => {
    const record = buildDeadLetterRecord(mockContext, 'string error message');

    expect(record.error.name).toBe('unknown');
    expect(record.error.message).toBe('string error message');
    expect(record.error.stack).toBeUndefined();
  });

  it('enriches record with custom metadata factory', () => {
    const error = new Error('fail');
    const record = buildDeadLetterRecord(mockContext, error, {
      metadata: (ctx) => ({
        tenantId: 'tenant-42',
        requestStarted: ctx.startedAt.toISOString(),
      }),
    });

    expect(record.metadata).toEqual({
      tenantId: 'tenant-42',
      requestStarted: mockContext.startedAt.toISOString(),
    });
  });
});

