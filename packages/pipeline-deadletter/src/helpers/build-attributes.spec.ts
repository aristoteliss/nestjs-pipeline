/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type IPipelineContext, setPipelineItem } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { DEAD_LETTER_ITEM_TOKEN } from '../dead-letter.behavior.js';
import { buildDeadLetterAttributes } from './build-attributes.js';

const context = () => ({ items: new Map() }) as unknown as IPipelineContext;

describe('buildDeadLetterAttributes', () => {
  it('reports a delivered dead letter', () => {
    const ctx = context();
    setPipelineItem(ctx, DEAD_LETTER_ITEM_TOKEN, true);

    expect(buildDeadLetterAttributes(ctx)).toEqual({
      'dead_letter.captured': true,
    });
  });

  it('reports nothing when no record was delivered or the behavior did not run', () => {
    const failed = context();
    setPipelineItem(failed, DEAD_LETTER_ITEM_TOKEN, false);

    expect(buildDeadLetterAttributes(failed)).toEqual({});
    expect(buildDeadLetterAttributes(context())).toEqual({});
  });
});
