/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import type { ArgumentsHost, HttpServer } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DomainExceptionFilter } from './domain-exception.filter.js';

/** Answers through the fake response, as Express's adapter does. */
const httpAdapter = {
  reply: (
    response: { status(code: number): { json(body: unknown): unknown } },
    body: unknown,
    status: number,
  ) => response.status(status).json(body),
  isHeadersSent: () => false,
  setHeader: () => undefined,
} as unknown as HttpServer;

describe('DomainExceptionFilter not-found boundary', () => {
  it('maps EntityNotFoundException to HTTP 404 without changing the application error', () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status, json }) }),
      getArgByIndex: () => ({ status, json }),
    } as unknown as ArgumentsHost;
    const exception = new EntityNotFoundException('User', 'user-123');

    new DomainExceptionFilter(httpAdapter).catch(exception, host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'Not Found',
      message: 'User not found',
    });
    expect(exception.entityId).toBe('user-123');
  });
});
