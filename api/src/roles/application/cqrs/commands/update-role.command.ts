/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseCommand } from '@cqrs-ddd/core/application';
import { createCommand, updatable } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';
import { Role } from '../../../domain/models/role.entity.js';

export class UpdateRoleCommand extends createCommand(
  z.object({
    id: z.uuid(),
    name: z
      .string()
      .trim()
      .min(Role.rules.name.minLength)
      .max(Role.rules.name.maxLength)
      .apply(updatable),
  }),
  BaseCommand,
) {}
