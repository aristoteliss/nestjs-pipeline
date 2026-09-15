/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EmailSchema } from '@common/validation/email.schema';
import { BaseCommand } from '@nestjs-pipeline/ddd-core';
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class CreateAuthCommand extends createCommand(
  z.object({
    email: EmailSchema,
    code: z.string().min(4).max(6),
  }),
  BaseCommand,
) {}
