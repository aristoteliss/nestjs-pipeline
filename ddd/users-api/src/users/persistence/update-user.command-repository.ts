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
export class UpdateUserCommandRepository extends CommandRepository<UserUpdateOutcome> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
    private readonly store: MemoryStore<UserSnapshot>,
  ) {
    super(cache);
  }

  //@Cacheable<UserCreateOutcome,UserSnapshot>((k) => k.entity.id, (o) => [o.entity.id])
  @Cacheable()
  async save(domainOutcome: UserUpdateOutcome): Promise<UserSnapshot> {
    const { entity } = domainOutcome;

    const snapshot = entity.toJSON();

    await this.store.save(entity.id, snapshot);

    return snapshot;
  }
}
