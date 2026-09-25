/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseCommand } from '@cqrs-ddd/core/application';
import { createCommand, updatable } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class UpdateRoleCommand extends createCommand(
  z.object({
    id: z.uuid(),
    name: z.string().trim().min(3).apply(updatable),
  }),
  BaseCommand,
) {}
