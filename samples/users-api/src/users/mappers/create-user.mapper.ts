import { CreateUserCommand } from '../cqrs/commands/create-user.command';
import { CreateUserDtoSchema } from '../dtos/create-user.dto';
import { createMapper } from './create-mapper.helper';

export const CreateUserMapper = createMapper(
  CreateUserDtoSchema.transform(
    ({ name, email }) => new CreateUserCommand({ username: name, email }),
  ),
);
