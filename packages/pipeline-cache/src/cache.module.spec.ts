/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CacheBehavior } from './cache.behavior';
import { CacheModule } from './cache.module';
import { CACHE_DEFAULT_OPTIONS, PIPELINE_CACHE } from './constants/tokens';

describe('CacheModule.forRoot', () => {
  it('builds a global dynamic module exporting cache tokens and behavior', () => {
    const dynamicModule = CacheModule.forRoot({ ttl: 15_000 });

    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.exports).toEqual([
      CacheBehavior,
      PIPELINE_CACHE,
      CACHE_DEFAULT_OPTIONS,
    ]);

    const defaultOptionsProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === CACHE_DEFAULT_OPTIONS,
    ) as any;
    expect(defaultOptionsProvider?.useValue).toEqual({ ttl: 15_000 });
  });

  it('logs initialized store type', () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => {});

    CacheModule.forRoot({ store: { type: 'memory' } });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Initialized cache with [memory] store'),
    );

    logSpy.mockRestore();
  });

  it('logs the same cache precedence used by construction', () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => {});

    CacheModule.forRoot({
      cache: {} as never,
      stores: [{} as never],
      store: { type: 'memory' },
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Initialized cache with [custom-cache] store'),
    );

    logSpy.mockRestore();
  });
});
