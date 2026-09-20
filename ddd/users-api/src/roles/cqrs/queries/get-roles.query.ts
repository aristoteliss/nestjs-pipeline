/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseQuery } from '@nestjs-pipeline/ddd-core/application';
import { createQuery } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class GetRolesQuery extends createQuery(
  z.object({
    names: z.optional(z.array(z.string())),
  }),
  BaseQuery,
) {}
