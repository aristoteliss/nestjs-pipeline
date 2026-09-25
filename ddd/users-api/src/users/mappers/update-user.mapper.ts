/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createZodMapper } from '@nestjs-pipeline/zod';
import { z } from 'zod';
import { UpdateUserCommand } from '../cqrs/commands/update-user.command';
import type { UpdateUserDto } from '../dtos/update-user.dto';

const base = createZodMapper(
  z
    .object({
      id: z.string(),
      name: z.string().optional(),
      department: z.string().nullable().optional(),
    })
    .transform(({ id, name, department }) => ({
      id,
      ...(name !== undefined ? { username: name } : {}),
      ...(department !== undefined ? { department } : {}),
    }))
    .pipe(UpdateUserCommand.schema)
    .transform((payload) => new UpdateUserCommand(payload)),
);

export const UpdateUserMapper = {
  ...base,
  map: (id: string, dto: UpdateUserDto) => base.map({ id, ...dto }),
};
