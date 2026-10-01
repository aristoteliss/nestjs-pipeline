/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RateLimitExceededError } from '../errors/rate-limit-exceeded.error.js';
import { RateLimitExceededFilter } from './rate-limit-exceeded.filter.js';

const error = new RateLimitExceededError({
  key: 'CreateUserCommand',
  requestName: 'CreateUserCommand',
  msBeforeNext: 2500,
  remainingPoints: 0,
  limit: 10,
});

describe('RateLimitExceededFilter', () => {
  it('answers 429 with a Retry-After header in whole seconds', () => {
    const response = {};
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    const reply = vi.fn();
    const setHeader = vi.fn();

    new RateLimitExceededFilter({
      httpAdapter: { reply, setHeader },
    } as unknown as HttpAdapterHost).catch(error, host);

    expect(setHeader).toHaveBeenCalledWith(response, 'Retry-After', '3');
    expect(reply).toHaveBeenCalledWith(
      response,
      {
        statusCode: 429,
        error: 'Too Many Requests',
        message: error.message,
        retryAfter: 3,
      },
      429,
    );
  });
});
