/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseCommand } from '@nestjs-pipeline/ddd-core';
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class CreateRoleCommand extends createCommand(
  z.object({
    name: z.string().trim().min(3),
  }),
  BaseCommand,
) {}
