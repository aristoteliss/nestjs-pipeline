/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { IdempotencyConflictError } from '../errors/idempotency-conflict.error';
import { IdempotencyConflictFilter } from './idempotency-conflict.filter';

describe('IdempotencyConflictFilter', () => {
  const response = {};
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;

  function createFilter() {
    const reply = vi.fn();
    const filter = new IdempotencyConflictFilter({
      httpAdapter: { reply },
    } as unknown as HttpAdapterHost);
    return { filter, reply };
  }

  it('maps in_progress error to 409 Conflict', () => {
    const { filter, reply } = createFilter();
    const error = new IdempotencyConflictError({
      key: 'user:123',
      requestName: 'CreateUserCommand',
      reason: 'in_progress',
    });

    filter.catch(error, host);

    expect(reply).toHaveBeenCalledWith(
      response,
      {
        statusCode: 409,
        error: 'Conflict',
        message: error.message,
        idempotencyKey: 'user:123',
        reason: 'in_progress',
      },
      409,
    );
  });

  it('maps key_reuse error to 422 Unprocessable Entity', () => {
    const { filter, reply } = createFilter();
    const error = new IdempotencyConflictError({
      key: 'user:456',
      requestName: 'CreateUserCommand',
      reason: 'key_reuse',
    });

    filter.catch(error, host);

    expect(reply).toHaveBeenCalledWith(
      response,
      {
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: error.message,
        idempotencyKey: 'user:456',
        reason: 'key_reuse',
      },
      422,
    );
  });
});
