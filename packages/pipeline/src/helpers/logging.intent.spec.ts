/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { LoggingBehavior } from '../behaviors/logging.behavior';
import { type LoggingIntentOptions, logging } from './logging.intent';

describe('logging intent builder', () => {
  it('creates entry with options object', () => {
    const entry = logging({ requestResponseLogLevel: 'log' });
    expect(entry[0]).toBe(LoggingBehavior);
    expect(entry[1]).toEqual({ requestResponseLogLevel: 'log' });
  });

  it('creates entry with empty options', () => {
    const entry = logging();
    expect(entry[0]).toBe(LoggingBehavior);
    expect(entry[1]).toEqual({});
  });

  it('validates options type compatibility', () => {
    expectTypeOf(logging).toBeFunction();
    expectTypeOf<{
      unknownProp: string;
    }>().not.toExtend<LoggingIntentOptions>();
  });
});
