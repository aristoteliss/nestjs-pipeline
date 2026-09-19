/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createMapper } from '@common/mappers/create-mapper.helper';
import { CreateUserCommand } from '../cqrs/commands/create-user.command';
import { CreateUserDtoSchema } from '../dtos/create-user.dto';

export const CreateUserMapper = createMapper(
  CreateUserDtoSchema.transform(
    ({ name, email, department }) =>
      new CreateUserCommand({
        username: name,
        email,
        ...(department !== undefined ? { department } : {}),
      }),
  ),
);
