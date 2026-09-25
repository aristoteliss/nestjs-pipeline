/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createZodMapper } from './create-zod-mapper';
import { ZodPipe } from './zod-param.pipe';

describe('createZodMapper', () => {
  const schema = z.object({
    id: z.string().min(1),
    count: z.number().int().positive(),
  });
  const mapper = createZodMapper(schema);

  it('successfully maps valid input to validated output', () => {
    const input = { id: 'item-1', count: 5 };
    const result = mapper.map(input);
    expect(result).toEqual({ id: 'item-1', count: 5 });
  });

  it('returns the transformed output and exposes the schema', () => {
    const toCommand = createZodMapper(
      schema.transform(({ id, count }) => ({ kind: 'command', id, count })),
    );

    expect(toCommand.map({ id: 'item-1', count: 2 })).toEqual({
      kind: 'command',
      id: 'item-1',
      count: 2,
    });
    expect(mapper.schema).toBe(schema);
  });

  it('throws BadRequestException with flattened error details on invalid input', () => {
    const invalidInput = { id: '', count: -1 };

    let caught: unknown;
    try {
      mapper.map(invalidInput);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(BadRequestException);
    const response = (caught as BadRequestException).getResponse();
    expect(response).toEqual({
      formErrors: [],
      fieldErrors: {
        id: [expect.any(String)],
        count: [expect.any(String)],
      },
    });
  });

  it('answers with the same body as ZodPipe for the same input', async () => {
    const invalidInput = { id: '', count: -1 };
    const fromPipe = await new ZodPipe(schema)
      .transform(invalidInput)
      .catch((err: BadRequestException) => err.getResponse());

    let fromMapper: unknown;
    try {
      mapper.map(invalidInput);
    } catch (err) {
      fromMapper = (err as BadRequestException).getResponse();
    }

    expect(fromMapper).toEqual(fromPipe);
  });
});
