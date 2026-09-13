import type { ArgumentsHost } from '@nestjs/common';
import { EntityNotFoundException } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { DomainExceptionFilter } from './domain-exception.filter';

describe('DomainExceptionFilter not-found boundary', () => {
  it('maps EntityNotFoundException to HTTP 404 without changing the application error', () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status, json }) }),
    } as unknown as ArgumentsHost;
    const exception = new EntityNotFoundException('User', 'user-123');

    new DomainExceptionFilter().catch(exception, host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'Not Found',
      message: 'User not found',
    });
    expect(exception.entityId).toBe('user-123');
  });
});
