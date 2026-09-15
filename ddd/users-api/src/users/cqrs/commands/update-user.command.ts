/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseCommand } from '@nestjs-pipeline/ddd-core';
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class UpdateUserCommand extends createCommand(
  z
    .object({
      id: z.uuid(),
      username: z.string().trim().min(3).optional(),
      department: z.string().trim().min(3).nullable().optional(),
    })
    .refine(
      (data) => data.username !== undefined || data.department !== undefined,
      {
        message: 'At least one of username or department must be provided',
      },
    ),
  BaseCommand,
) {}
