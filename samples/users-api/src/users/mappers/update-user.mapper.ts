import { z } from 'zod';
import { UpdateUserCommand } from '../cqrs/commands/update-user.command';
import {
  type UpdateUserDto,
  UpdateUserDtoSchema,
} from '../dtos/update-user.dto';
import { createMapper } from './create-mapper.helper';

const base = createMapper(
  z
    .object({ id: z.uuid() })
    .extend(UpdateUserDtoSchema.shape)
    .transform(({ id, name }) => new UpdateUserCommand({ id, username: name })),
);

export const UpdateUserMapper = {
  ...base,
  map: (id: string, dto: UpdateUserDto) => base.map({ id, ...dto }),
};
