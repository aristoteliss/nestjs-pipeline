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
import { describe, expect, it } from 'vitest';
import { ZodError, z } from 'zod';
import { ZodValidationError } from './zod-validation.error';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ZodValidationError', () => {
  // Helper: parse with a schema and return the ZodError
  function parseError(schema: z.ZodType, data: unknown): ZodError {
    const result = schema.safeParse(data);
    if (result.success) throw new Error('Expected parse to fail');
    return result.error;
  }

  it('sets message to "Validation failed"', () => {
    const err = new ZodValidationError(parseError(z.string(), 42));
    expect(err.message).toBe('Validation failed');
  });

  it('sets name to "ZodValidationError"', () => {
    const err = new ZodValidationError(parseError(z.string(), 42));
    expect(err.name).toBe('ZodValidationError');
  });

  it('is an instance of Error', () => {
    const err = new ZodValidationError(parseError(z.string(), 42));
    expect(err).toBeInstanceOf(Error);
  });

  it('exposes flattened fieldErrors for object schemas', () => {
    const schema = z.object({ foo: z.string(), bar: z.number() });
    const err = new ZodValidationError(
      parseError(schema, { foo: 123, bar: 'nope' }),
    );

    expect(err.details).toHaveProperty('fieldErrors');
    expect(err.details.fieldErrors).toHaveProperty('foo');
    expect(err.details.fieldErrors).toHaveProperty('bar');
  });

  it('exposes flattened formErrors for top-level validation failures', () => {
    const schema = z.string().min(5);
    const err = new ZodValidationError(parseError(schema, 'ab'));

    expect(err.details).toHaveProperty('formErrors');
    expect(err.details.formErrors.length).toBeGreaterThan(0);
  });

  it('details is readonly and serializable', () => {
    const err = new ZodValidationError(parseError(z.string(), 42));

    // Should survive JSON round-trip (serializable)
    const json = JSON.parse(JSON.stringify(err.details));
    expect(json).toHaveProperty('formErrors');
  });

  it('handles multiple field errors in a single object', () => {
    const schema = z.object({
      name: z.string().min(3),
      age: z.number().int().positive(),
      email: z.string().email(),
    });
    const err = new ZodValidationError(
      parseError(schema, { name: 'a', age: -1, email: 'bad' }),
    );

    expect(Object.keys(err.details.fieldErrors!)).toHaveLength(3);
  });
});
