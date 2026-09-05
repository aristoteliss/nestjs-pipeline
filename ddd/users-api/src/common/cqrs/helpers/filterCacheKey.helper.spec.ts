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

import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { DEFAULT_TENANT_SCHEMA } from '@persistence/postgres-options';
import { describe, expect, it } from 'vitest';
import { filterCacheKey } from './filterCacheKey.helper';

describe('filterCacheKey', () => {
  const entity = { prefixKey: 'user:' };

  it('generates a deterministic key with sorted keys', () => {
    const key1 = filterCacheKey(
      entity,
      { email: 'test@example.com', department: 'engineering' },
      'tenant_test',
    );
    const key2 = filterCacheKey(
      entity,
      { department: 'engineering', email: 'test@example.com' },
      'tenant_test',
    );

    expect(key1).toBe(
      'tenant_test:user:department:engineering:email:test@example.com',
    );
    expect(key1).toBe(key2);
  });

  it('filters out undefined and null values', () => {
    const key = filterCacheKey(
      entity,
      { id: '123', missing: undefined, empty: null },
      'tenant_test',
    );

    expect(key).toBe('tenant_test:user:id:123');
  });

  it('resolves tenant from explicit string parameter', () => {
    const key = filterCacheKey(entity, { id: '1' }, 'tenant_explicit');
    expect(key).toBe('tenant_explicit:user:id:1');
  });

  it('resolves tenant from pipeline context ctx.tenantId', () => {
    const ctx = {
      tenantId: 'tenant_from_ctx',
    } as unknown as IPipelineContext;

    const key = filterCacheKey(entity, { id: '1' }, ctx);
    expect(key).toBe('tenant_from_ctx:user:id:1');
  });

  it('falls back to ambient pipelineStore when tenantOrContext is omitted', () => {
    pipelineStore.run(
      { tenantId: 'tenant_ambient' } as unknown as IPipelineContext,
      () => {
        const key = filterCacheKey(entity, { id: '1' });
        expect(key).toBe('tenant_ambient:user:id:1');
      },
    );
  });

  it('falls back to DEFAULT_TENANT_SCHEMA when no tenant is available', () => {
    const key = filterCacheKey(entity, { id: '1' });
    expect(key).toBe(`${DEFAULT_TENANT_SCHEMA}:user:id:1`);
  });
});
