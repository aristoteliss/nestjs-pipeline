import type { ICache } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { filterCacheKey } from '../src/common/cqrs/helpers/filterCacheKey.helper';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/** E2E regression coverage for Architecture.md finding #16. */
describe('canonical repository cache keys (e2e)', () => {
  let ctx: E2EContext;
  let cache: ICache<{ marker: string }>;

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    cache = ctx.app.get<ICache<{ marker: string }>>(CACHE_TOKEN);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('addresses the same real cache entry for structurally equal nested filters', async () => {
    const firstKey = filterCacheKey(
      'deployment',
      { compose: { service: 'web', file: 'docker-compose.yml' } },
      'tenant',
    );
    const secondKey = filterCacheKey(
      'deployment',
      { compose: { file: 'docker-compose.yml', service: 'web' } },
      'tenant',
    );

    expect(firstKey).toBe(secondKey);
    await cache.set(firstKey, { marker: 'canonical' });
    await expect(cache.get(secondKey)).resolves.toEqual({ marker: 'canonical' });
  });
});
