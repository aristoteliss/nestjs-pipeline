/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseCommand } from '@cqrs-ddd/core/application';
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class DeleteUserCommand extends createCommand(
  z.object({
    id: z.uuid(),
  }),
  BaseCommand,
) {}
