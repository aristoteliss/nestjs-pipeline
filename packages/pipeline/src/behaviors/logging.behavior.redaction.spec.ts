/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import type { IPipelineContext } from '../interfaces/pipeline.context.interface';
import { LoggingBehavior } from './logging.behavior';

function context(options?: Record<string, unknown>): IPipelineContext {
  return {
    correlationId: 'corr-1',
    originalCorrelationId: 'corr-1',
    request: {
      email: 'user@example.com',
      password: 'secret-password',
      nested: { accessToken: 'secret-token', internal: 'remove-me' },
    },
    requestType: class TestCommand {},
    requestName: 'TestCommand',
    handlerType: class TestHandler {},
    handlerName: 'TestHandler',
    requestKind: 'command',
    startedAt: new Date(),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn().mockReturnValue(options),
  } as unknown as IPipelineContext;
}

describe('LoggingBehavior payload compatibility and redaction', () => {
  it('keeps develop defaults when no options are configured', async () => {
    const logger = { debug: vi.fn(), log: vi.fn(), error: vi.fn() };
    const behavior = new LoggingBehavior(logger as never);

    await behavior.handle(
      context(undefined),
      vi.fn().mockResolvedValue(undefined),
    );

    expect(logger.debug).toHaveBeenNthCalledWith(
      1,
      'Request: [exclude request obj]',
      'TestHandler',
    );
    expect(logger.debug).toHaveBeenLastCalledWith(
      'Response: [exclude response obj]',
      'TestHandler',
    );
    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  it('masks sensitive fields as soon as payload logging is switched on', async () => {
    // Enabling payload logging used to print passwords and tokens verbatim,
    // because redaction was opt-in on top of an opt-in.
    const logger = { debug: vi.fn(), log: vi.fn(), error: vi.fn() };
    const behavior = new LoggingBehavior(logger as never);

    await behavior.handle(
      context({
        excludeRequestObj: false,
        excludeResponseObj: true,
        requestResponseLogLevel: 'debug',
      }),
      vi.fn().mockResolvedValue(undefined),
    );

    const requestLine = logger.debug.mock.calls[0][0] as string;
    expect(requestLine).toContain('user@example.com');
    expect(requestLine).not.toContain('secret-password');
    expect(requestLine).not.toContain('secret-token');
    expect(requestLine).toContain('[REDACTED]');
  });

  it('logs payloads verbatim only when masking is explicitly disabled', async () => {
    const logger = { debug: vi.fn(), log: vi.fn(), error: vi.fn() };
    const behavior = new LoggingBehavior(logger as never);

    await behavior.handle(
      context({
        excludeRequestObj: false,
        excludeResponseObj: true,
        requestResponseLogLevel: 'debug',
        redactSensitiveKeys: false,
      }),
      vi.fn().mockResolvedValue(undefined),
    );

    const requestLine = logger.debug.mock.calls[0][0] as string;
    expect(requestLine).toContain('secret-password');
    expect(requestLine).toContain('secret-token');
  });

  it('keeps excludeKeys as full omission alongside default masking', async () => {
    const logger = { debug: vi.fn(), log: vi.fn(), error: vi.fn() };
    const behavior = new LoggingBehavior(logger as never);

    await behavior.handle(
      context({
        excludeRequestObj: false,
        excludeResponseObj: true,
        requestResponseLogLevel: 'debug',
        excludeKeys: ['password', 'nested.internal'],
      }),
      vi.fn().mockResolvedValue(undefined),
    );

    const requestLine = logger.debug.mock.calls[0][0] as string;
    // Excluded keys disappear entirely; the remaining sensitive key is masked
    // rather than printed, which is the behavioral change.
    expect(requestLine).not.toContain('secret-password');
    expect(requestLine).not.toContain('remove-me');
    expect(requestLine).not.toContain('secret-token');
    expect(requestLine).toContain('[REDACTED]');
  });

  it('keeps the structured output shape, with sensitive values masked', async () => {
    const logger = { debug: vi.fn(), log: vi.fn(), error: vi.fn() };
    const behavior = new LoggingBehavior(logger as never);

    await behavior.handle(
      context({
        excludeRequestObj: false,
        excludeResponseObj: false,
        requestResponseLogLevel: 'debug',
        logFormat: 'structured',
        excludeKeys: ['password'],
      }),
      vi.fn().mockResolvedValue({ status: 'ok', token: 'legacy-visible' }),
    );

    expect(logger.debug.mock.calls[0][0]).toEqual({
      msg: 'Request → TestHandler',
      request: {
        email: 'user@example.com',
        nested: { accessToken: '[REDACTED]', internal: 'remove-me' },
      },
    });
    expect(logger.debug.mock.calls[1][0]).toEqual({
      msg: 'Response ← TestHandler',
      response: { status: 'ok', token: '[REDACTED]' },
    });
  });

  it('masks built-in sensitive fields when redactSensitiveKeys is enabled', async () => {
    const logger = { debug: vi.fn(), log: vi.fn(), error: vi.fn() };
    const behavior = new LoggingBehavior(logger as never);

    await behavior.handle(
      context({
        excludeRequestObj: false,
        excludeResponseObj: true,
        requestResponseLogLevel: 'debug',
        redactSensitiveKeys: true,
      }),
      vi.fn().mockResolvedValue(undefined),
    );

    const requestLine = logger.debug.mock.calls[0][0] as string;
    expect(requestLine).toContain('user@example.com');
    expect(requestLine).not.toContain('secret-password');
    expect(requestLine).not.toContain('secret-token');
    expect(requestLine).toContain('[REDACTED]');
  });

  it('merges custom redactions and keeps excludeKeys as full omission', async () => {
    const logger = { debug: vi.fn(), log: vi.fn(), error: vi.fn() };
    const behavior = new LoggingBehavior(logger as never);

    await behavior.handle(
      context({
        excludeRequestObj: false,
        excludeResponseObj: true,
        requestResponseLogLevel: 'debug',
        redactSensitiveKeys: true,
        redactKeys: ['email'],
        excludeKeys: ['nested.internal'],
      }),
      vi.fn().mockResolvedValue(undefined),
    );

    const requestLine = logger.debug.mock.calls[0][0] as string;
    expect(requestLine).not.toContain('user@example.com');
    expect(requestLine).not.toContain('secret-password');
    expect(requestLine).not.toContain('remove-me');
  });

  it('also supports redaction in structured payload logs', async () => {
    const logger = { debug: vi.fn(), log: vi.fn(), error: vi.fn() };
    const behavior = new LoggingBehavior(logger as never);

    await behavior.handle(
      context({
        excludeRequestObj: false,
        excludeResponseObj: true,
        requestResponseLogLevel: 'debug',
        logFormat: 'structured',
        redactSensitiveKeys: true,
      }),
      vi.fn().mockResolvedValue(undefined),
    );

    expect(logger.debug.mock.calls[0][0]).toMatchObject({
      request: expect.objectContaining({ password: '[REDACTED]' }),
    });
  });
});
