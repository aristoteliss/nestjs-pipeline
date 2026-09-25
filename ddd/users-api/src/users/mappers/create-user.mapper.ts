/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createZodMapper } from '@nestjs-pipeline/zod';
import { z } from 'zod';
import { CreateUserCommand } from '../cqrs/commands/create-user.command';
import {
  type CreateUserDto,
  CreateUserDtoSchema,
} from '../dtos/create-user.dto';

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
