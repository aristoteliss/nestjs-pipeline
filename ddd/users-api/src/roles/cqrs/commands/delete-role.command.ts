/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseCommand } from '@nestjs-pipeline/ddd-core';
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class DeleteRoleCommand extends createCommand(
  z.object({
    id: z.uuid(),
  }),
  BaseCommand,
) {}
