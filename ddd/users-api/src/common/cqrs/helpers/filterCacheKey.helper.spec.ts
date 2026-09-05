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
import { cacheKeyTemplate, filterCacheKey } from './filterCacheKey.helper';

describe('filterCacheKey', () => {
  it('generates a deterministic key with sorted keys using resource string', () => {
    const key1 = filterCacheKey(
      'user',
      { email: 'test@example.com', department: 'engineering' },
      'tenant_test',
    );
    const key2 = filterCacheKey(
      'user',
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
      'user',
      { id: '123', missing: undefined, empty: null },
      'tenant_test',
    );

    expect(key).toBe('tenant_test:user:id:123');
  });

  it('resolves tenant from explicit string parameter', () => {
    const key = filterCacheKey('user', { id: '1' }, 'tenant_explicit');
    expect(key).toBe('tenant_explicit:user:id:1');
  });

  it('resolves tenant from pipeline context ctx.tenantId', () => {
    const ctx = {
      tenantId: 'tenant_from_ctx',
    } as unknown as IPipelineContext;

    const key = filterCacheKey('user', { id: '1' }, ctx);
    expect(key).toBe('tenant_from_ctx:user:id:1');
  });

  it('falls back to ambient pipelineStore when tenantOrContext is omitted', () => {
    pipelineStore.run(
      { tenantId: 'tenant_ambient' } as unknown as IPipelineContext,
      () => {
        const key = filterCacheKey('user', { id: '1' });
        expect(key).toBe('tenant_ambient:user:id:1');
      },
    );
  });

  it('falls back to DEFAULT_TENANT_SCHEMA when no tenant is available', () => {
    const key = filterCacheKey('user', { id: '1' });
    expect(key).toBe(`${DEFAULT_TENANT_SCHEMA}:user:id:1`);
  });

  it('maintains backwards compatibility with { prefixKey } objects', () => {
    const legacy = { prefixKey: 'user:' };
    const key = filterCacheKey(legacy, { id: '1' }, 'tenant_compat');
    expect(key).toBe('tenant_compat:user:id:1');
  });

  it('resolves prefix from static aggregateName on entity classes', () => {
    class MockAggregate {
      static readonly aggregateName = 'user';
    }
    const key = filterCacheKey(MockAggregate, { id: '42' }, 'tenant_agg');
    expect(key).toBe('tenant_agg:user:id:42');
  });

  it('escapes colons in primitive values to prevent key collision attacks', () => {
    const keyWithColonValue = filterCacheKey('x', { a: 'hello:b:world' }, 't1');
    const keyWithSeparateProps = filterCacheKey(
      'x',
      { a: 'hello', b: 'world' },
      't1',
    );

    expect(keyWithColonValue).toBe('t1:x:a:hello\\:b\\:world');
    expect(keyWithSeparateProps).toBe('t1:x:a:hello:b:world');
    expect(keyWithColonValue).not.toBe(keyWithSeparateProps);
  });

  it('deterministically serializes nested objects without [object Object]', () => {
    const key1 = filterCacheKey(
      'deployment',
      {
        compose: {
          service: 'postgres',
          file: '/app/docker-compose.yml',
        },
      },
      't1',
    );

    const key2 = filterCacheKey(
      'deployment',
      {
        compose: {
          file: '/app/docker-compose.yml',
          service: 'postgres',
        },
      },
      't1',
    );

    expect(key1).not.toContain('[object Object]');
    expect(key1).toBe(
      't1:deployment:compose:{"file":"/app/docker-compose.yml","service":"postgres"}',
    );
    expect(key1).toBe(key2);
  });

  it('throws an error if resourceOrEntity has neither aggregateName nor prefixKey', () => {
    class UnnamedClass {}
    expect(() => {
      filterCacheKey(UnnamedClass as never, { id: '1' }, 't1');
    }).toThrow(
      'Cannot resolve cache key prefix: resourceOrEntity must be a string or declare a static aggregateName or prefixKey.',
    );
  });

  it('throws in production mode if tenant context is missing', () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(() => {
        filterCacheKey('user', { id: '1' });
      }).toThrow(
        'Missing tenant context: cannot derive cache key without an explicit tenant in production mode.',
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});

describe('cacheKeyTemplate', () => {
  it('interpolates payload parameters into the template string', () => {
    const template = cacheKeyTemplate('user:{userId}', 'tenant_test');
    expect(template({ userId: 'u-123' })).toBe('tenant_test:user:u-123');
  });

  it('resolves parameters from IPipelineContext request and tenantId', () => {
    const ctx = {
      tenantId: 'tenant_ctx',
      request: { userId: 'u-999' },
    } as unknown as IPipelineContext;

    const template = cacheKeyTemplate('user:{userId}');
    expect(template(ctx)).toBe('tenant_ctx:user:u-999');
  });

  it('throws an error when a required placeholder is missing or nullish', () => {
    const template = cacheKeyTemplate('user:{userId}', 'tenant_test');
    expect(() => template({})).toThrow(
      'Cannot resolve cache key template: missing required placeholder "userId".',
    );
    expect(() => template({ userId: null })).toThrow(
      'Cannot resolve cache key template: missing required placeholder "userId".',
    );
  });

  it('supports optional placeholders marked with ?', () => {
    const template = cacheKeyTemplate('user:{userId}:{roleId?}', 'tenant_test');
    expect(template({ userId: 'u-123' })).toBe('tenant_test:user:u-123:');
    expect(template({ userId: 'u-123', roleId: 'admin' })).toBe(
      'tenant_test:user:u-123:admin',
    );
  });
});
