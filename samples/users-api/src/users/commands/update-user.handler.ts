import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UpdateUserCommand } from './update-user.command';
import { UserDto, usersStore } from './create-user.handler';

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand, UserDto> {
  async execute(command: UpdateUserCommand): Promise<UserDto> {
    const user = usersStore.get(command.id);
    
    if (!user) {
      throw new NotFoundException(`User ${command.id} not found`);
    }

    const updatedUser: UserDto = {
      ...user,
      name: command.name,
    };

    usersStore.set(command.id, updatedUser);

    return updatedUser;
  }
}
