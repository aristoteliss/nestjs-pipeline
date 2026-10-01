/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createZodMapper } from '@nestjs-pipeline/zod';
import { z } from 'zod';
import { CreateUserCommand } from '../application/cqrs/commands/create-user.command.js';
import {
  type CreateUserDto,
  CreateUserDtoSchema,
} from '../dtos/create-user.dto.js';

const base = createZodMapper(
  CreateUserDtoSchema.extend({
    idempotencyKey: z.string().optional(),
  }).transform(
    ({ name, email, department, idempotencyKey }) =>
      new CreateUserCommand({
        username: name,
        email,
        ...(department !== undefined ? { department } : {}),
        ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      }),
  ),
);

export const CreateUserMapper = {
  ...base,
  map: (dto: CreateUserDto, idempotencyKey?: string) =>
    base.map({ ...dto, idempotencyKey }),
};
