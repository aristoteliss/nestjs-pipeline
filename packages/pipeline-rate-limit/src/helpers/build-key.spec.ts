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
  it.each([undefined, {}, { keyPrefix: 'rl' }])(
    'refuses to invent a bucket when no keyFactory is configured: %j',
    (options) => {
      // The obvious default — requestName — is one bucket shared by every caller
      // in every tenant, so a single client can lock out everyone. Failing here
      // makes the partitioning decision explicit at the first request.
      expect(() => buildRateLimitKey(makeContext(), options)).toThrow(
        TypeError,
      );
      expect(() => buildRateLimitKey(makeContext(), options)).toThrow(
        'requires an explicit keyFactory',
      );
    },
  );

  it('accepts a deliberately global bucket when the caller asks for one', () => {
    const key = buildRateLimitKey(makeContext(), {
      keyFactory: (ctx) => ctx.requestName,
    });

    expect(key).toBe('CreateUserCommand');
  });

  it('uses the keyFactory when provided', () => {
    const key = buildRateLimitKey(makeContext(), {
      keyFactory: (ctx) => (ctx.request as { email: string }).email,
    });

    expect(key).toBe('a@b.test');
  });

  it('prepends the keyPrefix to a factory-derived key', () => {
    const key = buildRateLimitKey(makeContext(), {
      keyPrefix: 'rl',
      keyFactory: (ctx) => (ctx.request as { email: string }).email,
    });

    expect(key).toBe('rl:a@b.test');
  });

  it('escapes a separator inside the prefix but leaves the key untouched', () => {
    // The key is already complete — a partitioned factory has escaped its own
    // segments — so re-escaping it here would mangle the documented shape.
    const key = buildRateLimitKey(makeContext(), {
      keyPrefix: 'env:prod',
      keyFactory: () => 'tenant\\:a:u-1',
    });

    expect(key).toBe('env\\:prod:tenant\\:a:u-1');
  });
});
