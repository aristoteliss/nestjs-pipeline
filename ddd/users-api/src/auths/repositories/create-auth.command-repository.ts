import { Client } from '@libsql/client';
import { Inject, Injectable } from '@nestjs/common';
import {
  Cacheable,
  CommandRepository,
  ICache,
} from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { TURSO_CLIENT } from '@persistence/turso-store';
import { AuthSnapshot } from '../domain/models/auth.entity';
import { AuthCreateOutcome } from '../domain/outcomes/auth-create.outcome';

@Injectable()
export class CreateAuthCommandRepository extends CommandRepository<AuthCreateOutcome> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<AuthSnapshot>,
    @Inject(TURSO_CLIENT) private readonly client: Client,
  ) {
    super(cache);
  }

  @Cacheable()
  async save(domainOutcome: AuthCreateOutcome): Promise<AuthSnapshot> {
    const { entity } = domainOutcome;

    const snapshot = entity.toJSON();

    await this.client.execute({
      sql: `INSERT INTO auth (id, tenant_id, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [
        snapshot.id,
        snapshot.tenantId ?? null,
        snapshot.token,
        new Date(snapshot.createdAt).getTime(),
        new Date(snapshot.updatedAt).getTime(),
      ],
    });

    return snapshot;
  }
}
