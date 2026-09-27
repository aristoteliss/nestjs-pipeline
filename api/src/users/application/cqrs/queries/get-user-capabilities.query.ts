/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseQuery } from '@cqrs-ddd/core/application';
import { createQuery } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class GetUserCapabilitiesQuery extends createQuery(
  z.object({
    userId: z.union([z.string().min(1), z.number()]),
  }),
  BaseQuery,
) {}
