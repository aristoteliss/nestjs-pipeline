import { Injectable } from '@nestjs/common';
import { ICommandRepository } from '@nestjs-pipeline/ddd-core';
import { MemoryStore } from '../db/memory-store';
import { UserSnapshot } from '../domain/models/user.entity';
import { UserUpdateOutcome } from '../domain/outcomes/user-update.outcome';

@Injectable()
export class DeleteUserPersistence
  implements ICommandRepository<UserUpdateOutcome>
{
  constructor(private readonly store: MemoryStore<UserSnapshot>) {}

  async save(command: UserUpdateOutcome): Promise<unknown> {
    const { entity } = command;

    await this.store.delete(entity.id);

    return;
  }
}
