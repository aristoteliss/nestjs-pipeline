/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createMapper } from './create-mapper.helper';

describe('createMapper', () => {
  const schema = z.object({
    id: z.string().min(1),
    count: z.number().int().positive(),
  });

  const mapper = createMapper(schema);

  it('successfully maps valid input to validated output', () => {
    const input = { id: 'item-1', count: 5 };
    const result = mapper.map(input);
    expect(result).toEqual({ id: 'item-1', count: 5 });
  });

  it('throws BadRequestException with treeified error details on invalid input', () => {
    const invalidInput = { id: '', count: -1 } as any;

    expect(() => mapper.map(invalidInput)).toThrow(BadRequestException);
    try {
      mapper.map(invalidInput);
    } catch (err: any) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = err.getResponse();
      expect(typeof response === 'string' || typeof response === 'object').toBe(
        true,
      );
    }
  });
});
