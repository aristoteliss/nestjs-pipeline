/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { FeatureFlagBehavior } from '../feature-flag.behavior';
import {
  type FeatureFlagIntentOptions,
  featureFlag,
} from './feature-flag.intent';

describe('featureFlag intent builder', () => {
  it('requires a flag at compile time', () => {
    expectTypeOf<object>().not.toExtend<FeatureFlagIntentOptions>();
    expectTypeOf<{ flag: number }>().not.toExtend<FeatureFlagIntentOptions>();
  });

  it('creates entry from options object', () => {
    const fallback = () => ({ fallback: true });
    const entry = featureFlag({
      flag: 'new-feature',
      defaultValue: true,
      fallback,
    });
    expect(entry[0]).toBe(FeatureFlagBehavior);
    expect(entry[1]).toEqual({
      flag: 'new-feature',
      defaultValue: true,
      fallback,
    });
  });
});
