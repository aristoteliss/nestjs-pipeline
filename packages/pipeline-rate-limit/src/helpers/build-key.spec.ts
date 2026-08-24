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
