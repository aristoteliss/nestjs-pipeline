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
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
 */
import { describe, it, expect } from 'vitest';
import { ZodValidationFilter } from './zod-validation.filter';
import { HttpStatus } from '@nestjs/common';
import { ZodValidationError } from '../errors/zod-validation.error';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockHost(cb: (body: any) => void) {
  return {
    switchToHttp: () => ({
      getResponse: () => ({
        status: (code: number) => ({
          json: (body: any) => cb({ code, ...body }),
        }),
      }),
    }),
  } as any;
}

function makeError(schema: z.ZodType, data: unknown): ZodValidationError {
  const result = schema.safeParse(data);
  if (result.success) throw new Error('Expected parse to fail');
  return new ZodValidationError(result.error);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ZodValidationFilter', () => {
  const filter = new ZodValidationFilter();

  it('responds with HTTP 400 status code', () => {
    const error = makeError(z.object({ name: z.string() }), { name: 123 });
    let response: any;
    filter.catch(error, createMockHost((body) => { response = body; }));
    expect(response.code).toBe(HttpStatus.BAD_REQUEST);
  });

  it('includes "Bad Request" as error string', () => {
    const error = makeError(z.string(), 42);
    let response: any;
    filter.catch(error, createMockHost((body) => { response = body; }));
    expect(response.error).toBe('Bad Request');
  });

  it('includes "Validation failed" as message', () => {
    const error = makeError(z.string(), 42);
    let response: any;
    filter.catch(error, createMockHost((body) => { response = body; }));
    expect(response.message).toBe('Validation failed');
  });

  it('includes flattened details from ZodValidationError', () => {
    const error = makeError(
      z.object({ email: z.string().email(), age: z.number().positive() }),
      { email: 'bad', age: -1 },
    );
    let response: any;
    filter.catch(error, createMockHost((body) => { response = body; }));

    expect(response.details).toHaveProperty('fieldErrors');
    expect(response.details.fieldErrors).toHaveProperty('email');
    expect(response.details.fieldErrors).toHaveProperty('age');
  });

  it('includes statusCode field in the response body', () => {
    const error = makeError(z.string(), null);
    let response: any;
    filter.catch(error, createMockHost((body) => { response = body; }));
    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
  });
});
