/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseCommand } from '@nestjs-pipeline/ddd-core/application';
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

/** Exchanges the refresh-token cookie for a new access token. */
export class RefreshAuthCommand extends createCommand(
  z.object({
    refreshToken: z.string().min(1),
    clientIp: z.string().min(1),
  }),
  BaseCommand,
) {}
