/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

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
import { RoleCreateOutcome } from '../domain/outcomes/role-create.outcome';

@Injectable()
export class CreateRoleCommandRepository extends CommandRepository<RoleCreateOutcome> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<RoleSnapshot>,
    @Inject(TURSO_CLIENT) private readonly client: Client,
  ) {
    super(cache);
  }

  @Cacheable()
  async save(domainOutcome: RoleCreateOutcome): Promise<RoleSnapshot> {
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
