/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createMapper } from '@common/mappers/create-mapper.helper';
import { z } from 'zod';
import { UpdateUserCommand } from '../cqrs/commands/update-user.command';
import {
  type UpdateUserDto,
  UpdateUserDtoShape,
} from '../dtos/update-user.dto';

const base = createMapper(
  z
    .object({ id: z.uuid() })
    .extend(UpdateUserDtoShape)
    .refine(
      (value) => value.name !== undefined || value.department !== undefined,
      { message: 'At least one mutable field must be supplied.' },
    )
    .transform(({ id, name, department }) => {
      return new UpdateUserCommand({
        id,
        ...(name !== undefined ? { username: name } : {}),
        ...(department !== undefined ? { department } : {}),
      });
    }),
);

export const UpdateUserMapper = {
  ...base,
  map: (id: string, dto: UpdateUserDto) => base.map({ id, ...dto }),
};
