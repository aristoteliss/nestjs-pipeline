/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type IPipelineContext, setPipelineItem } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENCY_OWNERSHIP_LOST_ITEM_TOKEN,
  IDEMPOTENCY_REPLAYED_ITEM_TOKEN,
} from '../idempotency.behavior.js';
import { buildIdempotencyAttributes } from './build-attributes.js';

const context = () => ({ items: new Map() }) as unknown as IPipelineContext;

describe('buildIdempotencyAttributes', () => {
  it('reports nothing when the idempotency behavior did not run', () => {
    expect(buildIdempotencyAttributes(context())).toEqual({});
  });

  it('reports a replay and a first execution alike', () => {
    const replayed = context();
    const executed = context();
    setPipelineItem(replayed, IDEMPOTENCY_REPLAYED_ITEM_TOKEN, true);
    setPipelineItem(executed, IDEMPOTENCY_REPLAYED_ITEM_TOKEN, false);

    expect(buildIdempotencyAttributes(replayed)).toEqual({
      'idempotency.replayed': true,
    });
    expect(buildIdempotencyAttributes(executed)).toEqual({
      'idempotency.replayed': false,
    });
  });

  it('reports lost ownership only when it happened', () => {
    const lost = context();
    const kept = context();
    setPipelineItem(lost, IDEMPOTENCY_OWNERSHIP_LOST_ITEM_TOKEN, true);
    setPipelineItem(kept, IDEMPOTENCY_OWNERSHIP_LOST_ITEM_TOKEN, false);

    expect(buildIdempotencyAttributes(lost)).toEqual({
      'idempotency.ownership_lost': true,
    });
    expect(buildIdempotencyAttributes(kept)).toEqual({});
  });
});
