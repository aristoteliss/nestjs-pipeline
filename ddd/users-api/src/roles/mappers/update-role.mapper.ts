import { createMapper } from '@common/mappers/create-mapper.helper';
import { z } from 'zod';
import { UpdateRoleCommand } from '../cqrs/commands/update-role.command';
import {
  type UpdateRoleDto,
  UpdateRoleDtoSchema,
} from '../dtos/update-role.dto';

const base = createMapper(
  z
    .object({ id: z.uuid() })
    .extend(UpdateRoleDtoSchema.shape)
    .transform(({ id, name }) => new UpdateRoleCommand({ id, name })),
);

export const UpdateRoleMapper = {
  ...base,
  map: (id: string, dto: UpdateRoleDto) => base.map({ id, ...dto }),
};
