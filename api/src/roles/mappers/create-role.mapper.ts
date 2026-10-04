/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createZodMapper } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';
import { CreateRoleCommand } from '../application/cqrs/commands/create-role.command.js';
import {
  type CreateRoleDto,
  CreateRoleDtoSchema,
} from '../dtos/create-role.dto.js';

const base = createZodMapper(
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
