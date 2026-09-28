/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type IPipelineContext, setPipelineItem } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { CACHE_HIT_ITEM_TOKEN } from '../cache.behavior';
import { buildCacheAttributes } from './build-attributes';

const context = () => ({ items: new Map() }) as unknown as IPipelineContext;

describe('buildCacheAttributes', () => {
  it('reports nothing when the cache behavior did not run', () => {
    expect(buildCacheAttributes(context())).toEqual({});
  });

  it('distinguishes a hit from a real miss', () => {
    const hit = context();
    const miss = context();
    setPipelineItem(hit, CACHE_HIT_ITEM_TOKEN, true);
    setPipelineItem(miss, CACHE_HIT_ITEM_TOKEN, false);

    expect(buildCacheAttributes(hit)).toEqual({ 'cache.hit': true });
    expect(buildCacheAttributes(miss)).toEqual({ 'cache.hit': false });
  });
});
