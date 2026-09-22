/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { MissingTenantContextError } from '../../domain/exceptions/missing-tenant-context.exception';
import { cacheKeyTemplate, filterCacheKey } from './filter-cache-key.helper';

describe('filterCacheKey', () => {
  it('generates a deterministic versioned key with sorted keys using resource string', () => {
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

    expect(key1).toMatch(/^tenant_test:user:v1:[0-9a-f]{64}$/);
    expect(key1).toBe(key2);
  });

  it('filters out undefined while retaining explicit null values', () => {
    const keyWithUndefined = filterCacheKey(
      'user',
      { id: '123', missing: undefined },
      'tenant_test',
    );
    const keyClean = filterCacheKey('user', { id: '123' }, 'tenant_test');
    const keyWithNull = filterCacheKey(
      'user',
      { id: '123', empty: null },
      'tenant_test',
    );

    expect(keyWithUndefined).toBe(keyClean);
    expect(keyWithNull).not.toBe(keyClean);
  });

  it('preserves primitive types distinguishing numbers and strings', () => {
    const keyString = filterCacheKey('user', { id: '123' }, 'tenant_test');
    const keyNumber = filterCacheKey('user', { id: 123 }, 'tenant_test');

    expect(keyString).not.toBe(keyNumber);
  });

  it('rejects unsupported types with TypeError', () => {
    expect(() =>
      filterCacheKey('user', { fn: () => {} }, 'tenant_test'),
    ).toThrow(TypeError);
    expect(() =>
      filterCacheKey('user', { sym: Symbol('test') }, 'tenant_test'),
    ).toThrow(TypeError);
    expect(() => filterCacheKey('user', { big: 123n }, 'tenant_test')).toThrow(
      TypeError,
    );
  });

  it('resolves tenant from explicit string parameter', () => {
    const key = filterCacheKey('user', { id: '1' }, 'tenant_explicit');
    expect(key).toMatch(/^tenant_explicit:user:v1:[0-9a-f]{64}$/);
  });

  it('resolves tenant from pipeline context ctx.tenantId', () => {
    const ctx = {
      tenantId: 'tenant_from_ctx',
    } as unknown as IPipelineContext;

    const key = filterCacheKey('user', { id: '1' }, ctx);
    expect(key).toMatch(/^tenant_from_ctx:user:v1:[0-9a-f]{64}$/);
  });

  it('falls back to ambient pipelineStore when tenantOrContext is omitted', () => {
    pipelineStore.run(
      { tenantId: 'tenant_ambient' } as unknown as IPipelineContext,
      () => {
        const key = filterCacheKey('user', { id: '1' });
        expect(key).toMatch(/^tenant_ambient:user:v1:[0-9a-f]{64}$/);
      },
    );
  });

  it('fails closed when no tenant is available, rather than sharing a namespace', () => {
    expect(() => filterCacheKey('user', { id: '1' })).toThrow(
      MissingTenantContextError,
    );
  });

  it('maintains backwards compatibility with { prefixKey } objects', () => {
    const legacy = { prefixKey: 'user:' };
    const key = filterCacheKey(legacy, { id: '1' }, 'tenant_compat');
    expect(key).toMatch(/^tenant_compat:user:v1:[0-9a-f]{64}$/);
  });

  it('resolves prefix from static aggregateName on entity classes', () => {
    class MockAggregate {
      static readonly aggregateName = 'user';
    }
    const key = filterCacheKey(MockAggregate, { id: '42' }, 'tenant_agg');
    expect(key).toMatch(/^tenant_agg:user:v1:[0-9a-f]{64}$/);
  });

  it('prevents key collisions with values containing colons and delimiters', () => {
    const keyWithColonValue = filterCacheKey('x', { a: 'hello:b:world' }, 't1');
    const keyWithSeparateProps = filterCacheKey(
      'x',
      { a: 'hello', b: 'world' },
      't1',
    );

    expect(keyWithColonValue).not.toBe(keyWithSeparateProps);
  });

  it('deterministically serializes nested objects regardless of property insertion order', () => {
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

    expect(key1).toMatch(/^t1:deployment:v1:[0-9a-f]{64}$/);
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

  it.each(['production', 'staging', 'test', 'development', undefined])(
    'fails closed regardless of NODE_ENV (%s), because tenant isolation cannot depend on how the process was started',
    (environment) => {
      const previous = process.env.NODE_ENV;
      try {
        if (environment === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = environment;

        expect(() => filterCacheKey('user', { id: '1' })).toThrow(
          MissingTenantContextError,
        );
      } finally {
        process.env.NODE_ENV = previous;
      }
    },
  );

  it('throws when resourceOrEntity is neither a string nor an object with aggregateName or prefixKey', () => {
    expect(() =>
      filterCacheKey(123 as any, { id: '1' }, 'tenant_test'),
    ).toThrow(/Cannot resolve cache key prefix/);
    expect(() => filterCacheKey({} as any, { id: '1' }, 'tenant_test')).toThrow(
      /Cannot resolve cache key prefix/,
    );
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

  it('serializes object placeholder values using stableStringify', () => {
    const template = cacheKeyTemplate('user:{filter}', 'tenant_test');
    expect(template({ filter: { b: 2, a: 1 } })).toBe(
      'tenant_test:user:{"a":1,"b":2}',
    );
  });
});
