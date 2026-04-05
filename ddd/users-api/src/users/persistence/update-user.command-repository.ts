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
export class UpdateUserCommandRepository extends CommandRepository<UserUpdateOutcome> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
    @Inject(TURSO_CLIENT) private readonly client: Client,
  ) {
    super(cache);
  }

  @Cacheable()
  async save(domainOutcome: UserUpdateOutcome): Promise<UserSnapshot> {
    const { entity } = domainOutcome;

    const snapshot = entity.toJSON();

    await this.client.execute({
      sql: `INSERT OR REPLACE INTO users (id, username, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [
        snapshot.id,
        snapshot.username,
        snapshot.email,
        new Date(snapshot.createdAt).getTime(),
        new Date(snapshot.updatedAt).getTime(),
      ],
    });

    return snapshot;
  }
}
