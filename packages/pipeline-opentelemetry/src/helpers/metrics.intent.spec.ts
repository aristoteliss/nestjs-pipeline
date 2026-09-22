/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { MetricsBehavior } from '../metrics.behavior';
import { type MetricsIntentOptions, metrics } from './metrics.intent';

describe('metrics intent builder', () => {
  it('creates entry with options object', () => {
    const entry = metrics({ meterName: 'users-api.auth' });
    expect(entry[0]).toBe(MetricsBehavior);
    expect(entry[1]).toEqual({ meterName: 'users-api.auth' });
  });

  it('creates entry with empty options', () => {
    const entry = metrics();
    expect(entry[0]).toBe(MetricsBehavior);
    expect(entry[1]).toEqual({});
  });

  it('validates options type compatibility', () => {
    expectTypeOf(metrics).toBeFunction();
    expectTypeOf<{
      unknownProp: string;
    }>().not.toExtend<MetricsIntentOptions>();
  });
});
