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

import { describe, expect, it } from 'vitest';
import {
  RATE_LIMIT_DEFAULT_OPTIONS,
  RATE_LIMITER,
} from './constants/tokens';
import type { RateLimiterLike } from './interfaces/rate-limiter.interface';
import { RateLimitBehavior } from './rate-limit.behavior';
import { RateLimitModule } from './rate-limit.module';

describe('RateLimitModule', () => {
  const mockLimiter: RateLimiterLike = {
    consume: async () => ({
      remainingPoints: 9,
      msBeforeNext: 0,
      consumedPoints: 1,
      isFirstInDuration: true,
    }),
  };

  it('registers globally via forRoot with limiter', () => {
    const dynamicModule = RateLimitModule.forRoot({
      limiter: mockLimiter,
      defaults: { points: 5 },
    });

    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.module).toBe(RateLimitModule);
    expect(dynamicModule.exports).toEqual([
      RateLimitBehavior,
      RATE_LIMITER,
      RATE_LIMIT_DEFAULT_OPTIONS,
    ]);

    const limiterProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === RATE_LIMITER,
    ) as any;
    const defaultsProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === RATE_LIMIT_DEFAULT_OPTIONS,
    ) as any;

    expect(limiterProvider?.useValue).toBe(mockLimiter);
    expect(defaultsProvider?.useValue).toEqual({ points: 5 });
  });

  it('registers globally via forRootAsync with factory', () => {
    const factory = () => mockLimiter;
    const dynamicModule = RateLimitModule.forRootAsync({
      useFactory: factory,
      defaults: { points: 10 },
    });

    expect(dynamicModule.global).toBe(true);
    const limiterProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === RATE_LIMITER,
    ) as any;
    expect(limiterProvider?.useFactory).toBe(factory);
  });
});

