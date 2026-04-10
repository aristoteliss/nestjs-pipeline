import { createMapper } from '@common/mappers/create-mapper.helper';
import { CreateRoleCommand } from '../cqrs/commands/create-role.command';
import { CreateRoleDtoSchema } from '../dtos/create-role.dto';

export const CreateRoleMapper = createMapper(
  CreateRoleDtoSchema.transform(({ name }) => new CreateRoleCommand({ name })),
);
