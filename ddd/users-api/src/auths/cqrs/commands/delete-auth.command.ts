/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseCommand } from '@nestjs-pipeline/ddd-core/application';
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

/**
 * Command requesting revocation of an authenticated session.
 *
 * Transports the resolved user ID and bearer token string so that
 * the handler can retrieve and delete the exact persistent `Auth` aggregate.
 */
export class DeleteAuthCommand extends createCommand(
  z.object({
    userId: z.string().min(1),
    token: z.string().min(1),
  }),
  BaseCommand,
) {}
