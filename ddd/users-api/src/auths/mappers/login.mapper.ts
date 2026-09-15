/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createMapper } from '@common/mappers/create-mapper.helper';
import { CreateAuthCommand } from '../cqrs/commands/create-auth.command';
import { LoginDtoSchema } from '../dtos/login.dto';

export const LoginMapper = createMapper(
  LoginDtoSchema.transform(
    ({ email, code }) => new CreateAuthCommand({ email, code }),
  ),
);
