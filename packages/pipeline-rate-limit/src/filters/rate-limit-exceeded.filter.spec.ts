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

import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RateLimitExceededError } from '../errors/rate-limit-exceeded.error';
import { RateLimitExceededFilter } from './rate-limit-exceeded.filter';

function makeHost(response: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

const error = new RateLimitExceededError({
  key: 'CreateUserCommand',
  requestName: 'CreateUserCommand',
  msBeforeNext: 2500,
  remainingPoints: 0,
  limit: 10,
});

describe('RateLimitExceededFilter', () => {
  it('responds 429 with a JSON body and a Fastify-style Retry-After header', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const header = vi.fn();
    const response = { status, header };

    new RateLimitExceededFilter().catch(error, makeHost(response));

    expect(header).toHaveBeenCalledWith('Retry-After', '3');
    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({
      statusCode: 429,
      error: 'Too Many Requests',
      message: error.message,
      retryAfter: 3,
    });
  });

  it('falls back to an Express-style setHeader', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const setHeader = vi.fn();
    const response = { status, setHeader };

    new RateLimitExceededFilter().catch(error, makeHost(response));

    expect(setHeader).toHaveBeenCalledWith('Retry-After', '3');
    expect(status).toHaveBeenCalledWith(429);
  });
});
