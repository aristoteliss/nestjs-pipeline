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
    requestType: class MockCommand { } as Type,
    requestName: 'MockCommand',
    handlerType: class MockHandler { } as Type,
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

  it('respects errorLogLevel and mapLogLevel when logging errors', async () => {
    class CustomDomainError extends Error {
      name = 'CustomDomainError';
    }
    class SpecificDomainError extends CustomDomainError {
      name = 'SpecificDomainError';
    }

    const mockLogger = {
      log: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      verbose: vi.fn(),
      fatal: vi.fn(),
    };

    const loggingBehavior = new LoggingBehavior(mockLogger);

    const mapLogLevel = new Map<any, any>([
      [CustomDomainError, 'warn'],
      [SpecificDomainError, 'verbose'],
    ]);

    const ctx = createMockContext({
      getBehaviorOptions: vi.fn().mockReturnValue({
        errorLogLevel: 'fatal',
        mapLogLevel,
      }),
    });

    // 1. Throws SpecificDomainError -> should log with 'verbose'
    const specificErr = new SpecificDomainError('specific error');
    await expect(
      loggingBehavior.handle(ctx, vi.fn().mockRejectedValue(specificErr)),
    ).rejects.toThrow(specificErr);
    expect(mockLogger.verbose).toHaveBeenCalledWith(
      expect.stringContaining('SpecificDomainError: specific error'),
      specificErr.stack,
      'MockHandler',
    );

    // 2. Throws CustomDomainError -> should log with 'warn'
    const customErr = new CustomDomainError('custom error');
    await expect(
      loggingBehavior.handle(ctx, vi.fn().mockRejectedValue(customErr)),
    ).rejects.toThrow(customErr);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('CustomDomainError: custom error'),
      customErr.stack,
      'MockHandler',
    );

    // 3. Throws unmapped Error -> falls back to errorLogLevel ('fatal')
    const genericErr = new Error('generic error');
    await expect(
      loggingBehavior.handle(ctx, vi.fn().mockRejectedValue(genericErr)),
    ).rejects.toThrow(genericErr);
    expect(mockLogger.fatal).toHaveBeenCalledWith(
      expect.stringContaining('Error: generic error'),
      genericErr.stack,
      'MockHandler',
    );
  });

  it('supports structured log format and error optionalParams', async () => {
    class ErrorWithDetails extends Error {
      optionalParams: unknown;
      constructor(msg: string, details: unknown) {
        super(msg);
        this.name = 'ErrorWithDetails';
        this.optionalParams = details;
      }
    }

    const mockLogger = {
      log: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      verbose: vi.fn(),
      fatal: vi.fn(),
    };

    const loggingBehavior = new LoggingBehavior(mockLogger);

    const ctx = createMockContext({
      request: { username: 'testuser', password: 'secretpassword' },
      getBehaviorOptions: vi.fn().mockReturnValue({
        logFormat: 'structured',
        excludeRequestObj: false,
        excludeResponseObj: false,
        excludeKeys: ['password'],
      }),
    });

    // Success structured logging
    await loggingBehavior.handle(ctx, vi.fn().mockResolvedValue({ status: 'ok' }));

    expect(mockLogger.debug).toHaveBeenCalledWith(
      {
        msg: 'Request → MockHandler',
        request: { username: 'testuser' },
      },
      'MockHandler',
    );
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'test-corr-id',
        requestKind: 'command',
        requestName: 'MockCommand',
        handlerName: 'MockHandler',
      }),
      'MockHandler',
    );

    // Error structured logging with optionalParams
    const err = new ErrorWithDetails('detailed error', { extraInfo: 'data' });
    await expect(
      loggingBehavior.handle(ctx, vi.fn().mockRejectedValue(err)),
    ).rejects.toThrow(err);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('ErrorWithDetails: detailed error'),
        stack: err.stack,
        optionalParams: [{ extraInfo: 'data' }],
      }),
      'MockHandler',
    );
  });
});
