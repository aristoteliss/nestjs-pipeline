/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EmailSchema } from '@common/validation/email.schema';
import { BaseCommand } from '@nestjs-pipeline/ddd-core/application';
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class CreateUserCommand extends createCommand(
  z.object({
    username: z.string().trim().min(3),
    email: EmailSchema,
    department: z.string().trim().min(3).optional(),
  }),
  BaseCommand,
) {}
