import { createQuery } from '@common/cqrs/helpers/createQuery.helper';
import { email, z } from 'zod';

export class GetUserQuery extends createQuery(
  z
    .object({
      userId: z.optional(z.uuid()),
      email: z.optional(email()),
    })
    .superRefine((value, ctx) => {
      const hasUserId = value.userId !== undefined;
      const hasEmail = value.email !== undefined;

      if (hasUserId && hasEmail) {
        ctx.addIssue({
          code: 'custom',
          message: 'Provide either userId or email, not both.',
          path: ['userId'],
        });
        ctx.addIssue({
          code: 'custom',
          message: 'Provide either userId or email, not both.',
          path: ['email'],
        });
      }

      if (!hasUserId && !hasEmail) {
        ctx.addIssue({
          code: 'custom',
          message: 'Either userId or email is required.',
          path: ['userId'],
        });
      }
    }),
) {}
