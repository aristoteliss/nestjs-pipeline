/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseCommand } from '@cqrs-ddd/core/application';
import { createCommand, updatable } from '@nestjs-pipeline/zod';
import { z } from 'zod';
import { User } from '../../domain/models/user.entity';

export const EMPTY_USER_UPDATE_MESSAGE =
  'At least one mutable field must be supplied.';

export class UpdateUserCommand extends createCommand(
  z
    .object({
      id: z.uuid(),
      username: z
        .string()
        .trim()
        .min(User.rules.username.minLength)
        .max(User.rules.username.maxLength)
        .apply(updatable)
        .optional(),
      department: z
        .string()
        .trim()
        .min(User.rules.department.minLength)
        .max(User.rules.department.maxLength)
        .apply(updatable)
        .nullable()
        .optional(),
    })
    .refine(
      (data) => data.username !== undefined || data.department !== undefined,
      { message: EMPTY_USER_UPDATE_MESSAGE },
    ),
  BaseCommand,
) {}
