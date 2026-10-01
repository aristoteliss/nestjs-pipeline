/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  BadRequestException,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodBadRequest } from './zod-bad-request.js';

const SignupSchema = z
  .object({
    email: z.email(),
    profile: z.object({ name: z.string().min(2), age: z.number().int() }),
    password: z.string(),
    confirm: z.string(),
  })
  .refine((signup) => signup.password === signup.confirm, {
    message: 'Passwords do not match',
  });

const invalid = {
  email: 'not-an-email',
  profile: { name: 'A', age: 1.5 },
  password: 'one',
  confirm: 'two',
};

describe('zodBadRequest', () => {
  it("fails Nest's schema validation pipe with the body Zod's flatten() produces", async () => {
    const pipe = new StandardSchemaValidationPipe({
      exceptionFactory: zodBadRequest,
    });
    const parsed = SignupSchema.safeParse(invalid);

    const error = await pipe
      .transform(invalid, { type: 'body', schema: SignupSchema })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect((error as BadRequestException).getResponse()).toEqual(
      z.flattenError(parsed.error as z.ZodError),
    );
  });

  it('groups issues by the key of a Standard Schema path segment', () => {
    const error = zodBadRequest([
      { message: 'Required', path: [{ key: 'email' }] },
      { message: 'Too short', path: [{ key: 'profile' }, { key: 'name' }] },
      { message: 'Too small', path: [{ key: 'profile' }, 'age'] },
      { message: 'Invalid form', path: [] },
      { message: 'Invalid', path: [0] },
      { message: 'Invalid input' },
    ]);

    expect(error.getResponse()).toEqual({
      formErrors: ['Invalid form', 'Invalid input'],
      fieldErrors: {
        email: ['Required'],
        profile: ['Too short', 'Too small'],
        0: ['Invalid'],
      },
    });
  });
});
