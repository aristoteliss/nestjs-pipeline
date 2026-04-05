import { Client } from '@libsql/client';
import { Inject, Injectable } from '@nestjs/common';
import {
  Cacheable,
  CommandRepository,
  ICache,
} from '@nestjs-pipeline/ddd-core';
import { TURSO_CLIENT } from '../db/turso-store';
import { UserSnapshot } from '../domain/models/user.entity';
import { UserCreateOutcome } from '../domain/outcomes/user-create.outcome';
import { CACHE_TOKEN } from './cache/memory.cache';

@Injectable()
export class CreateUserCommandRepository extends CommandRepository<UserCreateOutcome> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
    @Inject(TURSO_CLIENT) private readonly client: Client,
  ) {
    super(cache);
  }

  //@Cacheable<UserCreateOutcome,UserSnapshot>((k) => k.entity.id, (o) => [o.entity.id])
  @Cacheable()
  async save(domainOutcome: UserCreateOutcome): Promise<UserSnapshot> {
    const { entity } = domainOutcome;

    const snapshot = entity.toJSON();

    await this.client.execute({
      sql: `INSERT OR REPLACE INTO users (id, data) VALUES (?, ?)`,
      args: [entity.id, JSON.stringify(snapshot)],
    });

    return snapshot;
  }
}
