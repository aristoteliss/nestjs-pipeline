/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import { describe, expect, it } from 'vitest';
import { buildCache, buildKeyv } from './cache-factory';

describe('cache-factory', () => {
  describe('buildKeyv', () => {
    it('creates in-memory Keyv store with namespace and ttl', () => {
      const keyv = buildKeyv({
        type: 'memory',
        namespace: 'test-ns',
        ttl: 5000,
      });
      expect(keyv).toBeInstanceOf(Keyv);
      expect(keyv.throwOnErrors).toBe(true);
    });

    it('creates adapter Keyv stores when configured', () => {
      const redisKeyv = buildKeyv({
        type: 'redis',
        url: 'redis://localhost:6379',
      });
      expect(redisKeyv).toBeInstanceOf(Keyv);

      const memcacheKeyv = buildKeyv({
        type: 'memcache',
        url: 'memcache://localhost:11211',
      });
      expect(memcacheKeyv).toBeInstanceOf(Keyv);
    });

    it('throws descriptive error when optional adapter is missing', () => {
      expect(() =>
        buildKeyv({ type: 'sqlite', url: 'sqlite://cache.sqlite' }),
      ).toThrowError(
        /\[pipeline-cache\] The optional '@keyv\/sqlite' package is required/,
      );
    });
  });

  describe('buildCache', () => {
    it('returns custom pre-built cache when provided', () => {
      const preBuilt = createCache({ stores: [new Keyv()] });
      const cache = buildCache({ cache: preBuilt });
      expect(cache).toBe(preBuilt);
    });

    it('does not mutate stores owned by a pre-built cache', () => {
      const customKeyv = new Keyv({ throwOnErrors: false });
      const preBuilt = createCache({ stores: [customKeyv] });

      const cache = buildCache({ cache: preBuilt });

      expect(cache).toBe(preBuilt);
      expect(customKeyv.throwOnErrors).toBe(false);
    });

    it('builds cache with custom pre-built Keyv stores without changing their error policy', () => {
      const customKeyv = new Keyv({
        namespace: 'custom',
        throwOnErrors: false,
      });

      const cache = buildCache({ stores: [customKeyv] });

      expect(cache).toBeDefined();
      expect(customKeyv.throwOnErrors).toBe(false);
    });

    it('builds cache with declarative memory store config', () => {
      const cache = buildCache({
        store: { type: 'memory', namespace: 'app' },
        ttl: 10000,
      });
      expect(cache).toBeDefined();
      expect(cache.stores[0]?.throwOnErrors).toBe(true);
    });

    it('builds default in-memory cache when options are empty', () => {
      const cache = buildCache({});
      expect(cache).toBeDefined();
      expect(cache.stores[0]?.throwOnErrors).toBe(true);
    });
  });
});
