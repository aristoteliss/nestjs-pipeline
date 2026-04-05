import { Client } from '@libsql/client';
import { Inject, Injectable } from '@nestjs/common';
import {
  Cacheable,
  CommandRepository,
  ICache,
} from '@nestjs-pipeline/ddd-core';
import { TURSO_CLIENT } from '../db/turso-store';
import { UserSnapshot } from '../domain/models/user.entity';
import { UserUpdateOutcome } from '../domain/outcomes/user-update.outcome';
import { CACHE_TOKEN } from './cache/memory.cache';

@Injectable()
export class DeleteUserCommandRepository extends CommandRepository<UserUpdateOutcome> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
    @Inject(TURSO_CLIENT) private readonly client: Client,
  ) {
    super(cache);
  }

  //@Cacheable<UserUpdateOutcome, null>(null, null)
  @Cacheable()
  async save(domainOutcome: UserUpdateOutcome): Promise<null> {
    const { entity } = domainOutcome;

    await this.client.execute({
      sql: `DELETE FROM users WHERE id = ?`,
      args: [entity.id],
    });

    return null;
  }
}
