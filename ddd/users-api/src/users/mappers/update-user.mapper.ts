import { createMapper } from '@common/mappers/create-mapper.helper';
import { z } from 'zod';
import { UpdateUserCommand } from '../cqrs/commands/update-user.command';
import {
  type UpdateUserDto,
  UpdateUserDtoSchema,
} from '../dtos/update-user.dto';

const base = createMapper(
  z
    .object({ id: z.uuid() })
    .extend(UpdateUserDtoSchema.shape)
    .transform(({ id, name, department }) => {
      return new UpdateUserCommand({
        id,
        username: name,
        department: department,
      });
    }),
);

export const UpdateUserMapper = {
  ...base,
  map: (id: string, dto: UpdateUserDto) => base.map({ id, ...dto }),
};
