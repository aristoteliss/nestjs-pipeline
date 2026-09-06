/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

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
