/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createMapper } from '@common/mappers/create-mapper.helper';
import { z } from 'zod';
import { CreateRoleCommand } from '../cqrs/commands/create-role.command';
import {
  type CreateRoleDto,
  CreateRoleDtoSchema,
} from '../dtos/create-role.dto';

const base = createMapper(
  CreateRoleDtoSchema.extend({
    idempotencyKey: z.string().optional(),
  }).transform(
    ({ name, idempotencyKey }) =>
      new CreateRoleCommand({
        name,
        ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      }),
  ),
);

export const CreateRoleMapper = {
  ...base,
  map: (dto: CreateRoleDto, idempotencyKey?: string) =>
    base.map({ ...dto, idempotencyKey }),
};
