/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { ResilienceBehavior } from '../resilience.behavior';
import { type ResilienceIntentOptions, resilience } from './resilience.intent';

describe('resilience intent builder', () => {
  it('requires a policy at compile time', () => {
    expectTypeOf<object>().not.toExtend<ResilienceIntentOptions>();
    expectTypeOf<{
      retry: { maxAttempts: string };
    }>().not.toExtend<ResilienceIntentOptions>();
  });
  it('creates entry with retry options', () => {
    const entry = resilience({
      retry: { maxAttempts: 3, replaySafe: true },
    });
    expect(entry[0]).toBe(ResilienceBehavior);
    expect(entry[1]).toEqual({
      retry: { maxAttempts: 3, replaySafe: true },
    });
  });

  it('creates entry with multiple resilience layers', () => {
    const entry = resilience({
      timeout: { duration: 1000 },
      bulkhead: { limit: 10 },
    });
    expect(entry[0]).toBe(ResilienceBehavior);
    expect(entry[1]).toEqual({
      timeout: { duration: 1000 },
      bulkhead: { limit: 10 },
    });
  });
});
