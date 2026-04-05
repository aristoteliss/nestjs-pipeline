import { Inject, Injectable } from '@nestjs/common';
import {
  Cacheable,
  CommandRepository,
  ICache,
} from '@nestjs-pipeline/ddd-core';
import { MemoryStore } from '../db/memory-store';
import { UserSnapshot } from '../domain/models/user.entity';
import { UserUpdateOutcome } from '../domain/outcomes/user-update.outcome';
import { CACHE_TOKEN } from './cache/memory.cache';

@Injectable()
export class DeleteUserCommandRepository extends CommandRepository<UserUpdateOutcome> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
    private readonly store: MemoryStore<UserSnapshot>,
  ) {
    super(cache);
  }

  //@Cacheable<UserUpdateOutcome, null>(null, null)
  @Cacheable()
  async save(domainOutcome: UserUpdateOutcome): Promise<null> {
    const { entity } = domainOutcome;

    await this.store.delete(entity.id);

    return null;
  }
}
