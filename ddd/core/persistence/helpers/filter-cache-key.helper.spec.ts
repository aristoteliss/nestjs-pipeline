/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { runWithTenant } from '../../application/tenant-scope';
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

  it('resolves tenant from an object carrying tenantId, such as a pipeline context', () => {
    const key = filterCacheKey(
      'user',
      { id: '1' },
      {
        tenantId: 'tenant_from_ctx',
      },
    );
    expect(key).toMatch(/^tenant_from_ctx:user:v1:[0-9a-f]{64}$/);
  });

  it('uses the tenant of the running scope when no tenant is passed', () => {
    const key = runWithTenant('tenant_scope', () =>
      filterCacheKey('user', { id: '1' }),
    );
    expect(key).toMatch(/^tenant_scope:user:v1:[0-9a-f]{64}$/);
  });

  it('keeps the scope tenant across awaits inside the scope', async () => {
    const key = await runWithTenant('tenant_async', async () => {
      await Promise.resolve();
      return filterCacheKey('user', { id: '1' });
    });
    expect(key).toMatch(/^tenant_async:user:v1:[0-9a-f]{64}$/);
  });

  it('prefers an explicit tenant over the running scope', () => {
    const key = runWithTenant('tenant_scope', () =>
      filterCacheKey('user', { id: '1' }, 'tenant_explicit'),
    );
    expect(key).toMatch(/^tenant_explicit:user:v1:[0-9a-f]{64}$/);
  });

  it.each([
    ['an object without tenantId', {}],
    ['an object with an undefined tenantId', { tenantId: undefined }],
  ])('falls back to the running scope for %s', (_label, source) => {
    const key = runWithTenant('tenant_scope', () =>
      filterCacheKey('user', { id: '1' }, source),
    );
    expect(key).toMatch(/^tenant_scope:user:v1:[0-9a-f]{64}$/);
  });

  it.each([
    ['an object without tenantId', {}],
    ['an object with an undefined tenantId', { tenantId: undefined }],
    ['an empty tenant id', ''],
    ['an object with an empty tenantId', { tenantId: '' }],
  ])(
    'fails closed for %s outside a scope, rather than sharing a namespace',
    (_label, source) => {
      expect(() => filterCacheKey('user', { id: '1' }, source)).toThrow(
        MissingTenantContextError,
      );
    },
  );

  it('fails closed for an empty tenant id even inside a scope', () => {
    expect(() =>
      runWithTenant('tenant_scope', () =>
        filterCacheKey('user', { id: '1' }, ''),
      ),
    ).toThrow(MissingTenantContextError);
  });

  it('fails closed inside a scope that carries no tenant', () => {
    expect(() =>
      runWithTenant(undefined, () => filterCacheKey('user', { id: '1' })),
    ).toThrow(MissingTenantContextError);
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

  it('resolves parameters from a context request and its tenantId', () => {
    const ctx = { tenantId: 'tenant_ctx', request: { userId: 'u-999' } };

    const template = cacheKeyTemplate('user:{userId}');
    expect(template(ctx)).toBe('tenant_ctx:user:u-999');
  });

  it('prefers an explicit tenant over a context tenantId', () => {
    const template = cacheKeyTemplate('user:{userId}', 'tenant_explicit');

    expect(
      template({ tenantId: 'tenant_ctx', request: { userId: 'u-1' } }),
    ).toBe('tenant_explicit:user:u-1');
  });

  it('uses the running scope for a plain source or a context without tenantId', () => {
    const template = cacheKeyTemplate('user:{userId}');

    runWithTenant('tenant_scope', () => {
      expect(template({ userId: 'u-1' })).toBe('tenant_scope:user:u-1');
      expect(template({ request: { userId: 'u-2' } })).toBe(
        'tenant_scope:user:u-2',
      );
      expect(
        template({ tenantId: 'tenant_ctx', request: { userId: 'u-3' } }),
      ).toBe('tenant_ctx:user:u-3');
    });
  });

  it('fails closed for a plain source without any tenant', () => {
    expect(() => cacheKeyTemplate('user:{userId}')({ userId: 'u-1' })).toThrow(
      MissingTenantContextError,
    );
    expect(() =>
      cacheKeyTemplate('user:{userId}')({ request: { userId: 'u-1' } }),
    ).toThrow(MissingTenantContextError);
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

/**
 * Exact keys recorded before the key helpers stopped depending on
 * `@nestjs-pipeline/core`. Stored cache entries are addressed by these strings,
 * so any change here would silently orphan them.
 */
describe('cache key frozen output', () => {
  class UserAggregate {
    static readonly aggregateName = 'user';
  }

  it.each([
    [
      'nested conditions',
      () =>
        filterCacheKey(
          'deployment',
          { compose: { service: 'web', file: 'docker-compose.yml' } },
          'tenant',
        ),
      'tenant:deployment:v1:4e68165b22f67f95b28ff69d3d8d733e632ac43a64404a10fdc0ef7f49cc81c0',
    ],
    [
      'a string id',
      () => filterCacheKey('user', { id: '123' }, 'tenant_golden'),
      'tenant_golden:user:v1:1b414969ba67c54bd26422ba572034c42b8615b90e7c40098bcbfbbc56d8d556',
    ],
    [
      'a numeric id',
      () => filterCacheKey('user', { id: 123 }, 'tenant_golden'),
      'tenant_golden:user:v1:2d86697ac0d0dca4d683874f835d3128a43c910e7649b83cd354d10a55456e02',
    ],
    [
      'a retained null and a dropped undefined',
      () =>
        filterCacheKey('user', { id: null, name: undefined }, 'tenant_golden'),
      'tenant_golden:user:v1:2e754bc2d34f163338128e77575acd3509eacad32ea63dd7d044a7abb362cff8',
    ],
    [
      'unsorted conditions',
      () => filterCacheKey('user', { b: 2, a: 1 }, 'tenant_golden'),
      'tenant_golden:user:v1:39778b4743f48240e2789aa23d6830a8b5082aa2f6f267298d4d51b261b0692d',
    ],
    [
      'a resource with a trailing colon',
      () => filterCacheKey('user:', { id: '1' }, 'tenant_golden'),
      'tenant_golden:user:v1:647a0712378b1f69e500fdf2c8cd7404c0a93a8ac1a0518af2646b2a74609fd2',
    ],
    [
      'delimiter characters',
      () => filterCacheKey('role', { name: 'a:b\\c' }, 'tenant_golden'),
      'tenant_golden:role:v1:deae7a209a04fb054a13316e71e6922d9eb442ff8cc14ad0031d33a326b4245c',
    ],
    [
      'nested unicode values',
      () =>
        filterCacheKey(
          'user',
          { filter: { z: [3, { y: 2, x: 1 }], a: 'ü' } },
          'tenant_golden',
        ),
      'tenant_golden:user:v1:421c136158f6010129c2f992cdb4d0be60a85f39fad92e8a6172f4071eb6a2f9',
    ],
    [
      'a date',
      () =>
        filterCacheKey(
          'user',
          { at: new Date('2026-01-02T03:04:05.000Z') },
          'tenant_golden',
        ),
      'tenant_golden:user:v1:eecfa31105580c0d97984471273056d92195c62aafb72bdafd593f2136c972d8',
    ],
    [
      'an aggregate class',
      () => filterCacheKey(UserAggregate, { id: '42' }, 'tenant_golden'),
      'tenant_golden:user:v1:221333cb3fd41732a4f39619212c9589e9929cce6c3d63b1642dbac6e7a20586',
    ],
    [
      'a prefixKey object',
      () =>
        filterCacheKey({ prefixKey: 'user:' }, { id: '1' }, 'tenant_golden'),
      'tenant_golden:user:v1:647a0712378b1f69e500fdf2c8cd7404c0a93a8ac1a0518af2646b2a74609fd2',
    ],
    [
      'an escaped template scalar',
      () =>
        cacheKeyTemplate(
          'user:{userId}',
          'tenant_golden',
        )({ userId: 'a:b\\c' }),
      'tenant_golden:user:a\\:b\\\\c',
    ],
    [
      'a template object placeholder',
      () =>
        cacheKeyTemplate(
          'user:{filter}',
          'tenant_golden',
        )({
          filter: { b: 2, a: [1, { d: 1, c: 2 }] },
        }),
      'tenant_golden:user:{"a":[1,{"c":2,"d":1}],"b":2}',
    ],
    [
      'a missing optional template placeholder',
      () =>
        cacheKeyTemplate(
          'user:{userId}:{roleId?}',
          'tenant_golden',
        )({
          userId: 1,
        }),
      'tenant_golden:user:1:',
    ],
    [
      'a template context source',
      () =>
        cacheKeyTemplate('user:{userId}')({
          request: { userId: 'u-9' },
          tenantId: 'tenant_ctx',
        }),
      'tenant_ctx:user:u-9',
    ],
  ])('keeps the key for %s', (_label, build, expected) => {
    expect(build()).toBe(expected);
  });
});
