/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EmailSchema } from '@common/validation/email.schema';
import { BaseQuery } from '@nestjs-pipeline/ddd-core';
import { createQuery } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class GetUserQuery extends createQuery(
  z
    .object({
      userId: z.optional(z.uuid()),
      email: z.optional(EmailSchema),
      department: z.optional(z.string()),
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
  BaseQuery,
) {}
