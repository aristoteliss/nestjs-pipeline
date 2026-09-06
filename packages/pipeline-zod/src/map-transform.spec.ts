import { z } from 'zod';
import { it } from 'vitest';
import { createCommand, ZodValidationBehavior } from './index';
it('accepts unchanged transform with object Map keys', async () => {
  const C = createCommand(
    z.object({ value: z.string().transform((s) => new Map([[{ id: 1 }, s]])) }),
  );
  const req = new C({ value: 'valid' });
  await new ZodValidationBehavior().handle(
    { request: req, requestType: C } as any,
    async () => true,
  );
});
