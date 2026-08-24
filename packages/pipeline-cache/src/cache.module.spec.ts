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
});
