/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { cacheKey } from '@cqrs-ddd/core/persistence';
import { describe, expect, it } from 'vitest';

describe('filterCacheKey core canonical serialization', () => {
  it('keeps nested key output stable regardless of object insertion order', () => {
    const left = cacheKey(
      'deployment',
      { compose: { service: 'postgres', file: '/app/docker-compose.yml' } },
      'tenant_a',
    );
    const right = cacheKey(
      'deployment',
      { compose: { file: '/app/docker-compose.yml', service: 'postgres' } },
      'tenant_a',
    );

    expect(left).toMatch(/^tenant_a:deployment:v1:[a-f0-9]{64}$/);
    expect(right).toBe(left);
  });

  it('inherits the core strict JSON boundary for unsupported object values', () => {
    expect(() =>
      cacheKey(
        'deployment',
        { compose: new Map([['a', 1]]) },
        'tenant_a',
      ),
    ).toThrow('stableStringify requires an acyclic JSON-serializable value.');
  });
});
