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

  it('keeps historical payload output when new redaction options are not enabled', async () => {
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
    expect(requestLine).toContain('secret-password');
    expect(requestLine).toContain('secret-token');
  });

  it('keeps legacy excludeKeys semantics without enabling redaction', async () => {
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
    expect(requestLine).not.toContain('secret-password');
    expect(requestLine).not.toContain('remove-me');
    expect(requestLine).toContain('secret-token');
    expect(requestLine).not.toContain('[REDACTED]');
  });

  it('keeps legacy structured output shape when only legacy options are used', async () => {
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
        nested: { accessToken: 'secret-token', internal: 'remove-me' },
      },
    });
    expect(logger.debug.mock.calls[1][0]).toEqual({
      msg: 'Response ← TestHandler',
      response: { status: 'ok', token: 'legacy-visible' },
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
