/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { expect, it } from 'vitest';
import { z } from 'zod';
import { createCommand, ZodValidationBehavior } from './index';

it('does not revalidate an unchanged request holding a Map with object keys', async () => {
  const C = createCommand(
    z.object({ value: z.string().transform((s) => new Map([[{ id: 1 }, s]])) }),
  );
  const req = new C({ value: 'valid' });
  await expect(
    new ZodValidationBehavior().handle(
      { request: req, requestType: C } as any,
      async () => true,
    ),
  ).resolves.toBe(true);
});
