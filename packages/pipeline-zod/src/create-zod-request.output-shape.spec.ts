/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createZodRequest } from './create-zod-request';

describe('createZodRequest output shape', () => {
  it.each([
    ['primitive', z.object({ value: z.string() }).transform((x) => x.value)],
    ['array', z.object({ value: z.string() }).transform((x) => [x.value])],
    ['Date', z.object({ value: z.string() }).transform(() => new Date(0))],
  ])('rejects a top-level %s transform', (_name, schema) => {
    const Request = createZodRequest(schema as never);
    expect(() => new Request({ value: 'x' } as never)).toThrow(
      /top-level parsed output to be a plain object/,
    );
  });

  it('continues to apply object transforms in-place', () => {
    const Request = createZodRequest(
      z.object({ value: z.string() }).transform(({ value }) => ({
        value: value.trim(),
        normalized: true,
      })),
    );

    const request = new Request({ value: '  x  ' });
    expect(request).toMatchObject({ value: 'x', normalized: true });
  });
  it.each([{}, { optional: undefined }])(
    'preserves parsed presence for %j in sync and async construction',
    async (input) => {
      const Request = createZodRequest(
        z.object({ optional: z.string().optional() }),
      );
      for (const request of [
        new Request(input),
        await Request.parseAsync(input),
      ]) {
        expect(Object.hasOwn(request, 'optional')).toBe(
          Object.hasOwn(input, 'optional'),
        );
        expect(Object.keys(request)).toEqual(Object.keys(input));
        expect(request.optional).toBeUndefined();
      }
    },
  );
});
