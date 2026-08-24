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
import { IdempotencyConflictError } from '../errors/idempotency-conflict.error';
import { IdempotencyConflictFilter } from './idempotency-conflict.filter';

describe('IdempotencyConflictFilter', () => {
  const filter = new IdempotencyConflictFilter();

  function createMockHost() {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const getResponse = vi.fn().mockReturnValue({ status });
    const switchToHttp = vi.fn().mockReturnValue({ getResponse });

    const host = {
      switchToHttp,
    } as unknown as ArgumentsHost;

    return { host, status, json };
  }

  it('maps in_progress error to 409 Conflict', () => {
    const { host, status, json } = createMockHost();
    const error = new IdempotencyConflictError({
      key: 'user:123',
      requestName: 'CreateUserCommand',
      reason: 'in_progress',
    });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      error: 'Conflict',
      message: error.message,
      idempotencyKey: 'user:123',
      reason: 'in_progress',
    });
  });

  it('maps key_reuse error to 422 Unprocessable Entity', () => {
    const { host, status, json } = createMockHost();
    const error = new IdempotencyConflictError({
      key: 'user:456',
      requestName: 'CreateUserCommand',
      reason: 'key_reuse',
    });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: error.message,
      idempotencyKey: 'user:456',
      reason: 'key_reuse',
    });
  });
});
