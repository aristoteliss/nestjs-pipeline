/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IdempotencyKeySchema } from '@common/validation/idempotency-key.schema';
import { BaseCommand } from '@cqrs-ddd/core/application';
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class CreateRoleCommand extends createCommand(
  z.object({
    name: z.string().trim().min(3),
    idempotencyKey: IdempotencyKeySchema.optional(),
  }),
  BaseCommand,
) {}
