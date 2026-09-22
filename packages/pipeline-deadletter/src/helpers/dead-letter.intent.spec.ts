/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { DeadLetterBehavior } from '../dead-letter.behavior';
import { type DeadLetterIntentOptions, deadLetter } from './dead-letter.intent';

describe('deadLetter intent builder', () => {
  it('creates entry with options object', () => {
    const entry = deadLetter({ redactKeys: ['refreshToken'], rethrow: false });
    expect(entry[0]).toBe(DeadLetterBehavior);
    expect(entry[1]).toEqual({ redactKeys: ['refreshToken'], rethrow: false });
  });

  it('creates entry with empty options', () => {
    const entry = deadLetter();
    expect(entry[0]).toBe(DeadLetterBehavior);
    expect(entry[1]).toEqual({});
  });

  it('validates options type compatibility', () => {
    expectTypeOf(deadLetter).toBeFunction();
    expectTypeOf<{
      unknownProp: string;
    }>().not.toExtend<DeadLetterIntentOptions>();
  });
});
