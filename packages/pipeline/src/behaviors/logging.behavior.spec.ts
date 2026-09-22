/* Copyright (C) 2026-present Aristotelis — see repository license. */

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

  it('passes handler context per log call without mutating a shared logger', async () => {
    const logger = {
      log: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      verbose: vi.fn(),
      fatal: vi.fn(),
      setContext: vi.fn(),
    };
    const sharedBehavior = new LoggingBehavior(logger);
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = sharedBehavior.handle(
      createMockContext({ handlerName: 'FirstHandler' }),
      vi.fn().mockImplementation(() => firstPending.then(() => 'first')),
    );
    await sharedBehavior.handle(
      createMockContext({ handlerName: 'SecondHandler' }),
      vi.fn().mockResolvedValue('second'),
    );
    releaseFirst();
    await first;

    expect(logger.setContext).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('FirstHandler completed'),
      'FirstHandler',
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('SecondHandler completed'),
      'SecondHandler',
    );
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
    await loggingBehavior.handle(
      ctx,
      vi.fn().mockResolvedValue({ status: 'ok' }),
    );

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

describe('LoggingBehavior failure isolation', () => {
  it.each(['debug', 'log', 'error'] as const)(
    'preserves outcomes when logger.%s throws',
    async (method) => {
      const failure = new Error('logger unavailable');
      const logger = {
        log: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      };
      logger[method].mockImplementation(() => {
        throw failure;
      });
      const behavior = new LoggingBehavior(logger);
      const next = vi.fn().mockResolvedValue('saved');
      await expect(behavior.handle(createMockContext(), next)).resolves.toBe(
        'saved',
      );
      expect(next).toHaveBeenCalledOnce();
      const businessError = new Error('business failure');
      await expect(
        behavior.handle(createMockContext(), () =>
          Promise.reject(businessError),
        ),
      ).rejects.toBe(businessError);
    },
  );

  it('preserves successful results when payload serialization throws', async () => {
    const payload = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        throw new Error('getter');
      },
    });
    const context = createMockContext({
      request: payload,
      getBehaviorOptions: () =>
        ({ excludeRequestObj: false, excludeResponseObj: false }) as never,
    });
    const behavior = new LoggingBehavior({
      log: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    });
    const next = vi.fn().mockResolvedValue(payload);
    await expect(behavior.handle(context, next)).resolves.toBe(payload);
    expect(next).toHaveBeenCalledOnce();
  });

  it('reports a suppressed log write instead of discarding it silently', async () => {
    const logger = {
      log: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };
    const payload = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        throw new Error('getter');
      },
    });
    const context = createMockContext({
      request: payload,
      getBehaviorOptions: () => ({ excludeRequestObj: false }) as never,
    });

    await expect(
      new LoggingBehavior(logger).handle(context, () =>
        Promise.resolve('saved'),
      ),
    ).resolves.toBe('saved');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('LoggingBehavior suppressed a log write'),
    );
  });

  it('stays silent when the logger itself is the failing component', async () => {
    const logger = {
      log: vi.fn(),
      debug: vi.fn(() => {
        throw new Error('logger unavailable');
      }),
      error: vi.fn(),
      warn: vi.fn(() => {
        throw new Error('logger unavailable');
      }),
    };

    await expect(
      new LoggingBehavior(logger).handle(createMockContext(), () =>
        Promise.resolve('saved'),
      ),
    ).resolves.toBe('saved');
  });

  it.each(['text', 'structured'])(
    'redacts error optionalParams in %s logs',
    async (logFormat) => {
      const logger = {
        log: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      };
      const error = Object.assign(new Error('denied'), {
        optionalParams: { password: 'secret-value', action: 'read' },
      });
      const context = createMockContext({
        getBehaviorOptions: () => ({ logFormat }) as never,
      });
      await expect(
        new LoggingBehavior(logger).handle(context, () =>
          Promise.reject(error),
        ),
      ).rejects.toBe(error);
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
        'secret-value',
      );
      expect(JSON.stringify(logger.error.mock.calls)).toContain('[REDACTED]');
    },
  );
});

describe('LoggingBehavior optional logger and error shapes', () => {
  it.each([false, true])(
    'preserves non-Error failures with structured=%s',
    async (structured) => {
      const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
      const options: LoggingBehaviorOptions = {
        logFormat: structured ? 'structured' : 'text',
        requestResponseLogLevel: 'none',
      };
      const context = createMockContext({
        getBehaviorOptions: () => options as never,
      });
      const behavior = new LoggingBehavior(logger);
      await expect(
        behavior.handle(context, async () => {
          throw 'failed';
        }),
      ).rejects.toBe('failed');
      expect(logger.error).toHaveBeenCalled();
      const message = logger.error.mock.calls[0][0];
      expect(structured ? message.message : message).toContain('failed');
    },
  );

  it.each([false, true])(
    'redacts array error parameters with structured=%s',
    async (structured) => {
      const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
      const failure = { optionalParams: [{ password: 'secret' }] };
      const context = createMockContext({
        getBehaviorOptions: () =>
          ({ logFormat: structured ? 'structured' : 'text' }) as never,
      });
      await expect(
        new LoggingBehavior(logger).handle(context, async () => {
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(JSON.stringify(logger.error.mock.calls)).toContain('[REDACTED]');
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain('secret');
    },
  );

  it('keeps the most specific mapped error level even when the base class is listed later', async () => {
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const options: LoggingBehaviorOptions = {
      mapLogLevel: new Map([
        [TypeError, 'warn'],
        [Error, 'error'],
        [SyntaxError, 'debug'],
      ]),
    };
    const failure = new TypeError('invalid input');
    const context = createMockContext({
      getBehaviorOptions: () => options as never,
    });
    await expect(
      new LoggingBehavior(logger).handle(context, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('invalid input'),
      expect.any(String),
      'MockHandler',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('supports disabled and unimplemented logger levels', async () => {
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const behavior = new LoggingBehavior(logger);
    for (const level of ['none', 'debug'] as const) {
      const options = {
        metricLogLevel: level,
        requestResponseLogLevel: level,
        errorLogLevel: level,
      };
      const context = createMockContext({
        getBehaviorOptions: () => options as never,
      });
      await expect(
        behavior.handle(context, async () => undefined),
      ).resolves.toBeUndefined();
      await expect(
        behavior.handle(context, async () => {
          throw null;
        }),
      ).rejects.toBeNull();
    }
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs a void response without serializing a missing value', async () => {
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const context = createMockContext({
      getBehaviorOptions: () =>
        ({
          requestResponseLogLevel: 'log',
          excludeResponseObj: false,
        }) as never,
    });
    await new LoggingBehavior(logger).handle(context, async () => undefined);
    expect(logger.log).toHaveBeenCalledWith('Response: (void)', 'MockHandler');
  });

  it('reports a non-Error logging failure without changing the result', async () => {
    const logger = {
      log: vi.fn(() => {
        throw 'logger unavailable';
      }),
      error: vi.fn(),
      warn: vi.fn(),
    };
    await expect(
      new LoggingBehavior(logger).handle(createMockContext(), async () => 'ok'),
    ).resolves.toBe('ok');
    expect(logger.warn).toHaveBeenCalledWith(
      'LoggingBehavior suppressed a log write: unknown error',
    );
  });
});
