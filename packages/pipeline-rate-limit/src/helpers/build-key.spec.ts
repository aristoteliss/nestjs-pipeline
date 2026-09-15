/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { buildRateLimitKey } from './build-key';

function makeContext(
  overrides: Partial<IPipelineContext> = {},
): IPipelineContext {
  return {
    correlationId: 'corr-1',
    requestKind: 'command',
    requestName: 'CreateUserCommand',
    handlerName: 'CreateUserHandler',
    request: { email: 'a@b.test' },
    ...overrides,
  } as IPipelineContext;
}

describe('buildRateLimitKey', () => {
  it('defaults to the request name', () => {
    expect(buildRateLimitKey(makeContext())).toBe('CreateUserCommand');
  });

  it('uses the keyFactory when provided', () => {
    const key = buildRateLimitKey(makeContext(), {
      keyFactory: (ctx) => (ctx.request as { email: string }).email,
    });

    expect(key).toBe('a@b.test');
  });

  it('prepends the keyPrefix to the request name', () => {
    const key = buildRateLimitKey(makeContext(), { keyPrefix: 'rl' });

    expect(key).toBe('rl:CreateUserCommand');
  });

  it('prepends the keyPrefix to a factory-derived key', () => {
    const key = buildRateLimitKey(makeContext(), {
      keyPrefix: 'rl',
      keyFactory: (ctx) => (ctx.request as { email: string }).email,
    });

    expect(key).toBe('rl:a@b.test');
  });

  it('treats an empty options object like no options', () => {
    expect(buildRateLimitKey(makeContext(), {})).toBe('CreateUserCommand');
  });
});
