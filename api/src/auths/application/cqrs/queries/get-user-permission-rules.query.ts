/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseQuery } from '@cqrs-ddd/core/application';
import { createQuery } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

export class GetUserPermissionRulesQuery extends createQuery(
  z.object({
    userId: z.union([z.string().min(1), z.number()]),
  }),
  BaseQuery,
) {}
