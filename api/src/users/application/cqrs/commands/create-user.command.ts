/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EmailSchema } from '@common/validation/email.schema.js';
import { IdempotencyKeySchema } from '@common/validation/idempotency-key.schema.js';
import { BaseCommand } from '@cqrs-ddd/core/application';
import { createCommand } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';
import { User } from '../../../domain/models/user.entity.js';

export class CreateUserCommand extends createCommand(
  z.object({
    username: z
      .string()
      .trim()
      .min(User.rules.username.minLength)
      .max(User.rules.username.maxLength),
    email: EmailSchema,
    department: z
      .string()
      .trim()
      .min(User.rules.department.minLength)
      .max(User.rules.department.maxLength)
      .optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  }),
  BaseCommand,
) {}
