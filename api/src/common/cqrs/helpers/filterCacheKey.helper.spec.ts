/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MissingTenantContextError } from '@cqrs-ddd/core/domain';
import { cacheKeyTemplate, filterCacheKey } from '@cqrs-ddd/core/persistence';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { runWithTenant } from '@nestjs-pipeline/tenant';
import { describe, expect, it } from 'vitest';

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

    expect(key1).toMatch(/^tenant_test:user:v1:[a-f0-9]{64}$/);
    expect(key1).toBe(key2);
  });

  it('filters out undefined and retains null values deterministically', () => {
    const key = filterCacheKey(
      'user',
      { id: '123', missing: undefined, empty: null },
      'tenant_test',
    );
    const keyExplicit = filterCacheKey(
      'user',
      { id: '123', empty: null },
      'tenant_test',
    );

    expect(key).toBe(keyExplicit);
    expect(key).toMatch(/^tenant_test:user:v1:[a-f0-9]{64}$/);
  });

  it('resolves tenant from explicit string parameter', () => {
    const key = filterCacheKey('user', { id: '1' }, 'tenant_explicit');
    expect(key).toMatch(/^tenant_explicit:user:v1:[a-f0-9]{64}$/);
  });

  it('resolves tenant from pipeline context ctx.tenantId', () => {
    const ctx = {
      tenantId: 'tenant_from_ctx',
    } as unknown as IPipelineContext;

    const key = filterCacheKey('user', { id: '1' }, ctx);
    expect(key).toMatch(/^tenant_from_ctx:user:v1:[a-f0-9]{64}$/);
  });

  it('uses the tenant of a runWithTenant scope when no tenant is passed', () => {
    const key = runWithTenant('tenant_scope', () =>
      filterCacheKey('user', { id: '1' }),
    );
    expect(key).toMatch(/^tenant_scope:user:v1:[a-f0-9]{64}$/);
  });

  it('fails closed when no tenant is available, rather than sharing a namespace', () => {
    expect(() => filterCacheKey('user', { id: '1' })).toThrow(
      MissingTenantContextError,
    );
  });

  it('uses the tenant of the running pipeline when no tenant is passed', () => {
    const key = pipelineStore.run(
      { tenantId: 'tenant_ambient' } as unknown as IPipelineContext,
      () => filterCacheKey('user', { id: '1' }),
    );
    expect(key).toMatch(/^tenant_ambient:user:v1:[a-f0-9]{64}$/);
  });

  it('maintains backwards compatibility with { prefixKey } objects', () => {
    const legacy = { prefixKey: 'user:' };
    const key = filterCacheKey(legacy, { id: '1' }, 'tenant_compat');
    const direct = filterCacheKey('user', { id: '1' }, 'tenant_compat');
    expect(key).toBe(direct);
  });

  it('resolves prefix from static aggregateName on entity classes', () => {
    class MockAggregate {
      static readonly aggregateName = 'user';
    }
    const key = filterCacheKey(MockAggregate, { id: '42' }, 'tenant_agg');
    const direct = filterCacheKey('user', { id: '42' }, 'tenant_agg');
    expect(key).toBe(direct);
  });

  it('escapes colons in primitive values to prevent key collision attacks', () => {
    const keyWithColonValue = filterCacheKey('x', { a: 'hello:b:world' }, 't1');
    const keyWithSeparateProps = filterCacheKey(
      'x',
      { a: 'hello', b: 'world' },
      't1',
    );

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
    expect(key1).toMatch(/^t1:deployment:v1:[a-f0-9]{64}$/);
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
