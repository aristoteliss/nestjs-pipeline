/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type ArgumentsHost, HttpStatus } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ZodValidationError } from '../errors/zod-validation.error.js';
import { ZodValidationFilter } from './zod-validation.filter.js';

const response = {};
const host = {
  switchToHttp: () => ({ getResponse: () => response }),
} as unknown as ArgumentsHost;

function makeError(schema: z.ZodType, data: unknown): ZodValidationError {
  const result = schema.safeParse(data);
  if (result.success) throw new Error('Expected parse to fail');
  return new ZodValidationError(result.error);
}

describe('ZodValidationFilter', () => {
  it('answers 400 through the HTTP adapter with the flattened details', () => {
    const reply = vi.fn();
    const filter = new ZodValidationFilter({
      httpAdapter: { reply },
    } as unknown as HttpAdapterHost);
    const error = makeError(
      z.object({ email: z.email(), age: z.number().positive() }),
      { email: 'bad', age: -1 },
    );

    filter.catch(error, host);

    expect(reply).toHaveBeenCalledWith(
      response,
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Validation failed',
        details: error.details,
      },
      HttpStatus.BAD_REQUEST,
    );
    expect(error.details.fieldErrors).toHaveProperty('email');
    expect(error.details.fieldErrors).toHaveProperty('age');
  });
});
