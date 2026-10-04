/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseCommand } from '@cqrs-ddd/core/application';
import { createCommand } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

export class RevokeAuthCommand extends createCommand(
  z.object({
    refreshToken: z.string().min(1).optional(),
    clientIp: z.string().min(1),
  }),
  BaseCommand,
) {}
