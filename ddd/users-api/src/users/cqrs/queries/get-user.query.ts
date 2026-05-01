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

import { createQuery } from '@common/cqrs/helpers/createQuery.helper';
import { email, z } from 'zod';

export class GetUserQuery extends createQuery(
  z
    .object({
      userId: z.optional(z.uuid()),
      email: z.optional(email()),
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
) { }
