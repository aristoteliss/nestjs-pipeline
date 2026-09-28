/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type IPipelineContext, setPipelineItem } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import type { RateLimiterResLike } from '../interfaces/rate-limiter.interface';
import { RATE_LIMIT_ITEM_TOKEN } from '../rate-limit.behavior';
import { buildRateLimitAttributes } from './build-attributes';

const context = () => ({ items: new Map() }) as unknown as IPipelineContext;

describe('buildRateLimitAttributes', () => {
  it('reports nothing when the rate-limit behavior did not run', () => {
    expect(buildRateLimitAttributes(context())).toEqual({});
  });

  it('reports the remaining points of the consumed window', () => {
    const ctx = context();
    setPipelineItem(ctx, RATE_LIMIT_ITEM_TOKEN, {
      remainingPoints: 7,
    } as RateLimiterResLike);

    expect(buildRateLimitAttributes(ctx)).toEqual({
      'rate_limit.remaining_points': 7,
    });
  });

  it('omits the points when the store reported none', () => {
    const ctx = context();
    setPipelineItem(ctx, RATE_LIMIT_ITEM_TOKEN, {} as RateLimiterResLike);

    expect(buildRateLimitAttributes(ctx)).toEqual({});
  });
});
