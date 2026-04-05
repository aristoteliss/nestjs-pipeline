import { Inject, Injectable } from '@nestjs/common';
import {
  Cacheable,
  CommandRepository,
  ICache,
} from '@nestjs-pipeline/ddd-core';
import { MemoryStore } from '../db/memory-store';
import { UserSnapshot } from '../domain/models/user.entity';
import { UserCreateOutcome } from '../domain/outcomes/user-create.outcome';
import { CACHE_TOKEN } from './cache/memory.cache';

@Injectable()
export class CreateUserCommandRepository extends CommandRepository<UserCreateOutcome> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
    private readonly store: MemoryStore<UserSnapshot>,
  ) {
    super(cache);
  }

  //@Cacheable<UserCreateOutcome,UserSnapshot>((k) => k.entity.id, (o) => [o.entity.id])
  @Cacheable()
  async save(domainOutcome: UserCreateOutcome): Promise<UserSnapshot> {
    const { entity } = domainOutcome;

    const snapshot = entity.toJSON();

    await this.store.save(entity.id, snapshot);

    return snapshot;
  }
}
