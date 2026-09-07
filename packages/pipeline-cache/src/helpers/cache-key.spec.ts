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

import { type IPipelineContext, stableStringify } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { defaultCacheKey } from './cache-key';

describe('stableStringify', () => {
  it('produces identical output regardless of key insertion order', () => {
    const a = stableStringify({ b: 1, a: 2, c: 3 });
    const b = stableStringify({ c: 3, a: 2, b: 1 });

    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":3}');
  });

  it('sorts keys recursively in nested objects', () => {
    const result = stableStringify({ outer: { z: 1, a: 2 }, first: true });
    expect(result).toBe('{"first":true,"outer":{"a":2,"z":1}}');
  });

  it('preserves array order', () => {
    expect(stableStringify({ items: [3, 1, 2] })).toBe(
      '{"items":[3,1,2]}',
    );
  });

  it('serializes primitives directly', () => {
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('hi')).toBe('"hi"');
    expect(stableStringify(null)).toBe('null');
  });
});

describe('defaultCacheKey', () => {
  function makeContext(
    overrides: Partial<IPipelineContext> = {},
  ): IPipelineContext {
    return {
      correlationId: 'corr-1',
      requestKind: 'query',
      requestName: 'GetUserQuery',
      handlerName: 'GetUserHandler',
      request: { userId: '42' },
      ...overrides,
    } as IPipelineContext;
  }

  it('includes correlation scope so defaults cannot replay across requests', () => {
    expect(defaultCacheKey(makeContext())).toBe(
      'corr-1:GetUserQuery:{"userId":"42"}',
    );
  });

  it('keeps stable request serialization within the same request scope', () => {
    const a = defaultCacheKey(
      makeContext({ request: { a: 1, b: 2 } as never }),
    );
    const b = defaultCacheKey(
      makeContext({ request: { b: 2, a: 1 } as never }),
    );

    expect(a).toBe(b);
  });

  it('partitions identical query payloads by correlation id', () => {
    const first = defaultCacheKey(makeContext({ correlationId: 'request-a' }));
    const second = defaultCacheKey(makeContext({ correlationId: 'request-b' }));

    expect(first).not.toBe(second);
  });

  it('partitions by tenant in addition to request scope', () => {
    const key = defaultCacheKey(
      makeContext({ tenantId: 'tenant_a', correlationId: 'corr-1' }),
    );

    expect(key).toBe('tenant_a:corr-1:GetUserQuery:{"userId":"42"}');
  });

  it('yields different keys for different request names', () => {
    const a = defaultCacheKey(makeContext({ requestName: 'GetUserQuery' }));
    const b = defaultCacheKey(makeContext({ requestName: 'GetUsersQuery' }));

    expect(a).not.toBe(b);
  });
});
