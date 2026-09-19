/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseQuery } from '@nestjs-pipeline/ddd-core/application';
import { createQuery } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class FindAuthQuery extends createQuery(
  z.object({
    userId: z.union([z.string().min(1), z.number()]),
    token: z.string().min(1),
  }),
  BaseQuery,
) {}
