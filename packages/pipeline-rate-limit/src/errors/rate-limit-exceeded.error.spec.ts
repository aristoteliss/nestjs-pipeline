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
import { RateLimitExceededError } from './rate-limit-exceeded.error';

describe('RateLimitExceededError', () => {
  it('correctly populates error properties and calculates retryAfterSeconds', () => {
    const error = new RateLimitExceededError({
      key: 'ip:127.0.0.1',
      requestName: 'LoginCommand',
      msBeforeNext: 2500,
      remainingPoints: 0,
      limit: 10,
    });

    expect(error.name).toBe('RateLimitExceededError');
    expect(error.key).toBe('ip:127.0.0.1');
    expect(error.requestName).toBe('LoginCommand');
    expect(error.msBeforeNext).toBe(2500);
    expect(error.retryAfterSeconds).toBe(3); // Math.ceil(2500 / 1000)
    expect(error.remainingPoints).toBe(0);
    expect(error.limit).toBe(10);
    expect(error.message).toContain('Rate limit exceeded for LoginCommand');
    expect(error.message).toContain('retry after 3s');
  });

  it('guarantees retryAfterSeconds is at least 1 when msBeforeNext is small', () => {
    const error = new RateLimitExceededError({
      key: 'user:1',
      requestName: 'FetchQuery',
      msBeforeNext: 50,
      remainingPoints: 0,
    });

    expect(error.retryAfterSeconds).toBe(1);
    expect(error.limit).toBeUndefined();
  });
});

