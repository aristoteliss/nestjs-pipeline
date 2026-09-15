/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseQuery } from '@nestjs-pipeline/ddd-core';
import { createQuery } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class GetRoleQuery extends createQuery(
  z.object({
    roleId: z.uuid(),
  }),
  BaseQuery,
) {}
