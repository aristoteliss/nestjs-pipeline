/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { FeatureFlagEvaluationError } from './feature-flag-evaluation.error';

describe('FeatureFlagEvaluationError', () => {
  it('includes the error code and provider message and keeps the cause', () => {
    const cause = new Error('backend unreachable');
    const error = new FeatureFlagEvaluationError(
      'checkout',
      'CheckoutCommand',
      'PROVIDER_NOT_READY',
      'warming up',
      { cause },
    );

    expect(error.name).toBe('FeatureFlagEvaluationError');
    expect(error.flag).toBe('checkout');
    expect(error.requestName).toBe('CheckoutCommand');
    expect(error.message).toBe(
      'Feature flag "checkout" could not be evaluated for CheckoutCommand (PROVIDER_NOT_READY): warming up',
    );
    expect(error.cause).toBe(cause);
  });

  it('omits the cause when none is given', () => {
    const error = new FeatureFlagEvaluationError('checkout', 'CheckoutCommand');

    expect(error.message).toBe(
      'Feature flag "checkout" could not be evaluated for CheckoutCommand',
    );
    expect('cause' in error).toBe(false);
  });

  it('omits the cause when the options carry an undefined cause', () => {
    const error = new FeatureFlagEvaluationError(
      'checkout',
      'CheckoutCommand',
      'FLAG_NOT_FOUND',
      undefined,
      { cause: undefined },
    );

    expect(error.message).toBe(
      'Feature flag "checkout" could not be evaluated for CheckoutCommand (FLAG_NOT_FOUND)',
    );
    expect('cause' in error).toBe(false);
  });
});
