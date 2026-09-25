/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodPipe } from './zod-param.pipe';

describe('ZodPipe', () => {
  describe('valid input', () => {
    it('returns the parsed value for a simple object schema', async () => {
      const pipe = new ZodPipe(z.object({ foo: z.string() }));
      await expect(pipe.transform({ foo: 'bar' })).resolves.toEqual({
        foo: 'bar',
      });
    });

    it('returns transformed output for a transform schema', async () => {
      const schema = z.string().transform((val) => val.toUpperCase());
      const pipe = new ZodPipe(schema);
      await expect(pipe.transform('hello')).resolves.toBe('HELLO');
    });

    it('works with coercion schemas', async () => {
      const schema = z.coerce.number();
      const pipe = new ZodPipe(schema);
      await expect(pipe.transform('42')).resolves.toBe(42);
    });

    it('keeps unknown keys for a .passthrough() schema', async () => {
      const schema = z.object({ a: z.string() }).passthrough();
      const pipe = new ZodPipe(schema);
      const result = await pipe.transform({ a: 'ok', extra: true });
      expect(result).toEqual({ a: 'ok', extra: true });
    });

    it('supports async refinements and transforms', async () => {
      const schema = z
        .string()
        .refine(async (value) => value.length > 0)
        .transform(async (value) => value.toUpperCase());
      const pipe = new ZodPipe(schema);

      await expect(pipe.transform('hello')).resolves.toBe('HELLO');
    });
  });

  describe('invalid input', () => {
    it('throws BadRequestException when validation fails', async () => {
      const pipe = new ZodPipe(z.object({ foo: z.string() }));
      await expect(pipe.transform({ foo: 123 } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('thrown error carries flattened Zod details', async () => {
      const pipe = new ZodPipe(z.object({ foo: z.string() }));
      try {
        await pipe.transform({ foo: 123 } as never);
        expect.unreachable('should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        const response = e.getResponse();
        expect(response).toHaveProperty('fieldErrors');
      }
    });

    it('throws for missing required fields', async () => {
      const pipe = new ZodPipe(z.object({ name: z.string(), age: z.number() }));
      await expect(pipe.transform({} as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws for completely wrong type (e.g. null)', async () => {
      const pipe = new ZodPipe(z.string());
      await expect(pipe.transform(null as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('generic type parameters', () => {
    it('can be typed with explicit TOutput and TInput', async () => {
      const schema = z.object({ id: z.string().uuid() });
      type Out = z.infer<typeof schema>;
      const pipe = new ZodPipe<Out, unknown>(schema);
      const result = await pipe.transform({
        id: '018e0d5c-4ef6-7000-b7c8-a1e6bc5c9e70',
      });
      expect(result.id).toBe('018e0d5c-4ef6-7000-b7c8-a1e6bc5c9e70');
    });
  });
});
