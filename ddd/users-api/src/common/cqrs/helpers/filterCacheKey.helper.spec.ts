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

import {
  type IPipelineContext,
  PIPELINE_TENANT_ID,
} from '@nestjs-pipeline/core';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { describe, expect, it } from 'vitest';
import { filterCacheKey } from './filterCacheKey.helper';

describe('filterCacheKey', () => {
  const entity = { prefixKey: 'user:' };
  const tenantContext = new TenantSchemaContext();

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

  it('resolves tenant from pipeline context items[PIPELINE_TENANT_ID]', () => {
    const ctx = {
      items: new Map([[PIPELINE_TENANT_ID, 'tenant_from_items']]),
    } as unknown as IPipelineContext;

    const key = filterCacheKey(entity, { id: '1' }, ctx);
    expect(key).toBe('tenant_from_items:user:id:1');
  });

  it('falls back to ambient TenantSchemaContext when tenantOrContext is omitted', () => {
    tenantContext.run('tenant_ambient', () => {
      const key = filterCacheKey(entity, { id: '1' });
      expect(key).toBe('tenant_ambient:user:id:1');
    });
  });

  it('falls back to ambient TenantSchemaContext when ctx has no tenantId or items', () => {
    tenantContext.run('tenant_ambient', () => {
      const ctx = {
        items: new Map(),
      } as unknown as IPipelineContext;
      const key = filterCacheKey(entity, { id: '1' }, ctx);
      expect(key).toBe('tenant_ambient:user:id:1');
    });
  });
});
