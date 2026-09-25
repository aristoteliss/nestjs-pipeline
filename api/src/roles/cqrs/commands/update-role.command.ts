/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseCommand } from '@cqrs-ddd/core/application';
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class UpdateRoleCommand extends createCommand(
  z.object({
    id: z.uuid(),
    name: z.string().trim().min(3),
  }),
  BaseCommand,
) {
  /** Fields governed by field-level authorization. See UpdateUserCommand. */
  static readonly MUTABLE_FIELDS = ['name'] as const;
}
