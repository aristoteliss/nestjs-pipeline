import { Injectable } from '@nestjs/common';
import { ICommandRepository } from '@nestjs-pipeline/ddd-core';
import { MemoryStore } from '../db/memory-store';
import { UserSnapshot } from '../domain/models/user.entity';
import { UserCreateOutcome } from '../domain/outcomes/user-create.outcome';

@Injectable()
export class CreateUserCommandRepository
  implements ICommandRepository<UserCreateOutcome>
{
  constructor(private readonly store: MemoryStore<UserSnapshot>) {}

  async save(command: UserCreateOutcome): Promise<unknown> {
    const { entity } = command;

    await this.store.save(entity.id, entity.toJSON());

    return;
  }
}
