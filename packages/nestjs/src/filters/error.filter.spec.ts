/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import { RateLimitExceededError } from '@cqrs-ddd/pipeline-rate-limit';
import type { ArgumentsHost, HttpServer } from '@nestjs/common';
import { BadRequestException, Logger } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorFilter } from './error.filter.js';

const response = {};
const host = {
  getArgByIndex: () => response,
  switchToHttp: () => ({ getResponse: () => response }),
} as unknown as ArgumentsHost;

function adapter() {
  return {
    reply: vi.fn(),
    setHeader: vi.fn(),
    isHeadersSent: vi.fn(() => false),
    end: vi.fn(),
  };
}

const rateLimited = () =>
  new RateLimitExceededError({
    key: 'k',
    requestName: 'CreateThing',
    msBeforeNext: 2500,
    remainingPoints: 0,
    limit: 1,
  });

describe('ErrorFilter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('answers a package error as its NestJS exception, with its headers', () => {
    const http = adapter();

    new ErrorFilter(http as unknown as HttpServer).catch(rateLimited(), host);

    expect(http.setHeader).toHaveBeenCalledWith(response, 'Retry-After', '3');
    expect(http.reply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ statusCode: 429, retryAfter: 3 }),
      429,
    );
  });

  it('answers through the adapter host when Nest injects it', () => {
    const http = adapter();
    const filter = new ErrorFilter();
    Object.assign(filter, {
      httpAdapterHost: { httpAdapter: http } as unknown as HttpAdapterHost,
    });

    filter.catch(new EntityNotFoundException('User', 'u-1'), host);

    expect(http.reply).toHaveBeenCalledWith(
      response,
      { statusCode: 404, error: 'Not Found', message: 'User not found' },
      404,
    );
  });

  it('leaves a NestJS exception and an unknown error to Nest', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const http = adapter();
    const filter = new ErrorFilter(http as unknown as HttpServer);

    filter.catch(new BadRequestException('bad'), host);
    filter.catch(new Error('boom'), host);

    expect(http.setHeader).not.toHaveBeenCalled();
    expect(http.reply).toHaveBeenNthCalledWith(
      1,
      response,
      { statusCode: 400, error: 'Bad Request', message: 'bad' },
      400,
    );
    expect(http.reply).toHaveBeenNthCalledWith(
      2,
      response,
      { statusCode: 500, message: 'Internal server error' },
      500,
    );
  });
});
