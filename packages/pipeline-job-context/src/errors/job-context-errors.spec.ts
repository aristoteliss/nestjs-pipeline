/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { InvalidJobContextError } from './invalid-job-context.error.js';
import { MissingJobContextError } from './missing-job-context.error.js';

describe('job context errors', () => {
  it('names what is missing and that nothing falls back to a default', () => {
    const error = new MissingJobContextError('principal');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('MissingJobContextError');
    expect(error.missing).toBe('principal');
    expect(error.message).toContain('principal');
    expect(error.message).toContain('never falls back');
  });

  it('names why a context is invalid', () => {
    const error = new InvalidJobContextError('principal is malformed');

    expect(error.name).toBe('InvalidJobContextError');
    expect(error.reason).toBe('principal is malformed');
    expect(error.message).toBe('Invalid job context: principal is malformed.');
  });
});
