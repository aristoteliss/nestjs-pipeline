import { z } from 'zod';
import { createMapper } from './create-mapper.helper';
import { UpdateUserDto, UpdateUserDtoSchema } from '../dtos/update-user.dto';
import { UpdateUserCommand } from '../cqrs/commands/update-user.command';

const base = createMapper(
  z.object({ id: z.uuid() })
    .extend(UpdateUserDtoSchema.shape)
    .transform(({ id, name }) => new UpdateUserCommand({ id, username: name })),
);

export const UpdateUserMapper = {
  ...base,
  map: (id: string, dto: UpdateUserDto) => base.map({ id, ...dto }),
};
