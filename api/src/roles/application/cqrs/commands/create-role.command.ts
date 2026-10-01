/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IdempotencyKeySchema } from '@common/validation/idempotency-key.schema.js';
import { BaseCommand } from '@cqrs-ddd/core/application';
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';
import { Role } from '../../../domain/models/role.entity.js';

export class CreateRoleCommand extends createCommand(
  z.object({
    name: z
      .string()
      .trim()
      .min(Role.rules.name.minLength)
      .max(Role.rules.name.maxLength),
    idempotencyKey: IdempotencyKeySchema.optional(),
  }),
  BaseCommand,
) {}
