/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createZodMapper } from '@nestjs-pipeline/zod';
import { z } from 'zod';
import { CreateAuthCommand } from '../cqrs/commands/create-auth.command';
import { type LoginDto, LoginDtoSchema } from '../dtos/login.dto';

const base = createZodMapper(
  LoginDtoSchema.extend({ clientIp: z.string() }).transform(
    ({ email, code, clientIp }) =>
      new CreateAuthCommand({ email, code, clientIp }),
  ),
);

export const LoginMapper = {
  ...base,
  map: (dto: LoginDto, clientIp: string) => base.map({ ...dto, clientIp }),
};
