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

import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodPipe } from './zod-param.pipe';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ZodPipe', () => {
  describe('valid input', () => {
    it('returns the parsed value for a simple object schema', () => {
      const pipe = new ZodPipe(z.object({ foo: z.string() }));
      expect(pipe.transform({ foo: 'bar' })).toEqual({ foo: 'bar' });
    });

    it('returns transformed output for a transform schema', () => {
      const schema = z.string().transform((val) => val.toUpperCase());
      const pipe = new ZodPipe(schema);
      expect(pipe.transform('hello')).toBe('HELLO');
    });

    it('works with coercion schemas', () => {
      const schema = z.coerce.number();
      const pipe = new ZodPipe(schema);
      expect(pipe.transform('42')).toBe(42);
    });

    it('strips unknown keys with .strict() alternative — passthrough still works', () => {
      const schema = z.object({ a: z.string() }).passthrough();
      const pipe = new ZodPipe(schema);
      const result = pipe.transform({ a: 'ok', extra: true });
      expect(result).toEqual({ a: 'ok', extra: true });
    });
  });

  describe('invalid input', () => {
    it('throws BadRequestException when validation fails', () => {
      const pipe = new ZodPipe(z.object({ foo: z.string() }));
      expect(() => pipe.transform({ foo: 123 })).toThrow(BadRequestException);
    });

    it('thrown error carries flattened Zod details', () => {
      const pipe = new ZodPipe(z.object({ foo: z.string() }));
      try {
        pipe.transform({ foo: 123 });
        expect.unreachable('should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        const response = e.getResponse();
        // The pipe passes error.flatten() to BadRequestException,
        // so getResponse() contains flattened fieldErrors
        expect(response).toHaveProperty('fieldErrors');
      }
    });

    it('throws for missing required fields', () => {
      const pipe = new ZodPipe(z.object({ name: z.string(), age: z.number() }));
      expect(() => pipe.transform({})).toThrow(BadRequestException);
    });

    it('throws for completely wrong type (e.g. null)', () => {
      const pipe = new ZodPipe(z.string());
      expect(() => pipe.transform(null)).toThrow(BadRequestException);
    });
  });

  describe('generic type parameters', () => {
    it('can be typed with explicit TOutput and TInput', () => {
      const schema = z.object({ id: z.string().uuid() });
      type Out = z.infer<typeof schema>;
      const pipe = new ZodPipe<Out, unknown>(schema);
      const result = pipe.transform({
        id: '018e0d5c-4ef6-7000-b7c8-a1e6bc5c9e70',
      });
      expect(result.id).toBe('018e0d5c-4ef6-7000-b7c8-a1e6bc5c9e70');
    });
  });
});
