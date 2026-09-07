import { describe, expect, it } from 'vitest';
import { filterCacheKey } from './filterCacheKey.helper';

describe('filterCacheKey core canonical serialization', () => {
  it('keeps nested key output stable regardless of object insertion order', () => {
    const left = filterCacheKey(
      'deployment',
      { compose: { service: 'postgres', file: '/app/docker-compose.yml' } },
      'tenant_a',
    );
    const right = filterCacheKey(
      'deployment',
      { compose: { file: '/app/docker-compose.yml', service: 'postgres' } },
      'tenant_a',
    );

    expect(left).toBe(
      'tenant_a:deployment:compose:{"file":"/app/docker-compose.yml","service":"postgres"}',
    );
    expect(right).toBe(left);
  });

  it('inherits the core strict JSON boundary for unsupported object values', () => {
    expect(() =>
      filterCacheKey('deployment', { compose: new Map([['a', 1]]) }, 'tenant_a'),
    ).toThrow('stableStringify requires an acyclic JSON-serializable value.');
  });
});
