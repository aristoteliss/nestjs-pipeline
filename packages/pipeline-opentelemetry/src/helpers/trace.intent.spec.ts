/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { TraceBehavior } from '../trace.behavior';
import { type TraceIntentOptions, trace } from './trace.intent';

describe('trace intent builder', () => {
  it('creates entry with options object', () => {
    const entry = trace({ tracerName: 'users-api' });
    expect(entry[0]).toBe(TraceBehavior);
    expect(entry[1]).toEqual({ tracerName: 'users-api' });
  });

  it('creates entry with empty options', () => {
    const entry = trace();
    expect(entry[0]).toBe(TraceBehavior);
    expect(entry[1]).toEqual({});
  });

  it('validates options type compatibility', () => {
    expectTypeOf(trace).toBeFunction();
    expectTypeOf<{ unknownProp: string }>().not.toExtend<TraceIntentOptions>();
  });
});
