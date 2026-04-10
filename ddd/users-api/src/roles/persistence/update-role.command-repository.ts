import { Client } from '@libsql/client';
import { Inject, Injectable } from '@nestjs/common';
import {
  Cacheable,
  CommandRepository,
  ICache,
} from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { TURSO_CLIENT } from '@persistence/turso-store';
import { RoleSnapshot } from '../domain/models/role.entity';
import { RoleUpdateOutcome } from '../domain/outcomes/role-update.outcome';

@Injectable()
export class UpdateRoleCommandRepository extends CommandRepository<RoleUpdateOutcome> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<RoleSnapshot>,
    @Inject(TURSO_CLIENT) private readonly client: Client,
  ) {
    super(cache);
  }

  @Cacheable()
  async save(domainOutcome: RoleUpdateOutcome): Promise<RoleSnapshot> {
    const { entity } = domainOutcome;

    const snapshot = entity.toJSON();

    await this.client.execute({
      sql: `INSERT OR REPLACE INTO roles (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      args: [
        snapshot.id,
        snapshot.name,
        new Date(snapshot.createdAt).getTime(),
        new Date(snapshot.updatedAt).getTime(),
      ],
    });

    return snapshot;
  }
}
