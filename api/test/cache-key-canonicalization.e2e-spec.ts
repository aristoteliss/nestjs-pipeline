/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ICache } from '@cqrs-ddd/core/application';
import { cacheKey } from '@cqrs-ddd/core/persistence';
import { CACHE } from '@persistence/cache/cache.token.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapE2E, type E2EContext, inTenant } from './support/e2e-app.js';

/** E2E regression coverage for Architecture.md finding #16. */
describe('canonical repository cache keys (e2e)', () => {
  let ctx: E2EContext;
  let cache: ICache<{ marker: string }>;

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    cache = ctx.app.get<ICache<{ marker: string }>>(CACHE);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('addresses the same real cache entry for structurally equal nested filters', () =>
    inTenant(ctx.app, async () => {
      const firstKey = cacheKey(
        'deployment',
        { compose: { service: 'web', file: 'docker-compose.yml' } },
        'tenant',
      );
      const secondKey = cacheKey(
        'deployment',
        { compose: { file: 'docker-compose.yml', service: 'web' } },
        'tenant',
      );

      expect(firstKey).toBe(secondKey);
      await cache.set(firstKey, { marker: 'canonical' });
      await expect(cache.get(secondKey)).resolves.toEqual({
        marker: 'canonical',
      });
    }));
});
