import { createMapper } from '@common/mappers/create-mapper.helper';
import { CreateUserCommand } from '../cqrs/commands/create-user.command';
import { CreateUserDtoSchema } from '../dtos/create-user.dto';

export const CreateUserMapper = createMapper(
  CreateUserDtoSchema.transform(
    ({ name, email }) => new CreateUserCommand({ username: name, email }),
  ),
);
