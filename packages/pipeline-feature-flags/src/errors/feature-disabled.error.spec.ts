/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { FeatureDisabledError } from './feature-disabled.error';

describe('FeatureDisabledError', () => {
  it('correctly populates error properties and message', () => {
    const error = new FeatureDisabledError('beta-feature', 'ExportDataQuery');

    expect(error.name).toBe('FeatureDisabledError');
    expect(error.flag).toBe('beta-feature');
    expect(error.requestName).toBe('ExportDataQuery');
    expect(error.message).toBe(
      'Feature "beta-feature" is disabled for ExportDataQuery',
    );
  });
});
