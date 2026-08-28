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
  it('responds 429 with a Fastify send body and Retry-After header', () => {
    const send = vi.fn();
    const response = {
      status: vi.fn(),
      header: vi.fn(),
      send,
    };
    response.status.mockReturnValue(response);

    new RateLimitExceededFilter().catch(error, makeHost(response));

    expect(response.header).toHaveBeenCalledWith('Retry-After', '3');
    expect(response.status).toHaveBeenCalledWith(429);
    expect(send).toHaveBeenCalledWith({
      statusCode: 429,
      error: 'Too Many Requests',
      message: error.message,
      retryAfter: 3,
    });
  });

  it('falls back to an Express-style setHeader and json response', () => {
    const json = vi.fn();
    const response = {
      status: vi.fn(),
      setHeader: vi.fn(),
      json,
    };
    response.status.mockReturnValue(response);

    new RateLimitExceededFilter().catch(error, makeHost(response));

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '3');
    expect(response.status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({
      statusCode: 429,
      error: 'Too Many Requests',
      message: error.message,
      retryAfter: 3,
    });
  });
});
