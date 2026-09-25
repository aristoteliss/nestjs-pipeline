/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseCommand } from '@cqrs-ddd/core/application';
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

/** Revokes the session that owns the presented refresh token (logout). */
export class DeleteAuthCommand extends createCommand(
  z.object({
    refreshToken: z.string().min(1),
  }),
  BaseCommand,
) {}
