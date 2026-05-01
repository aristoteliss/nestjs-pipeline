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

import { Inject, Injectable } from '@nestjs/common';
import {
  Cacheable,
  CommandRepository,
  ICache,
} from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { Role, RoleSnapshot } from '../domain/models/role.entity';
import { RoleUpdateOutcome } from '../domain/outcomes/role-update.outcome';

@Injectable()
export class UpdateRoleCommandRepository extends CommandRepository<RoleUpdateOutcome> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<RoleSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  @Cacheable()
  async save(domainOutcome: RoleUpdateOutcome): Promise<RoleSnapshot> {
    const { entity } = domainOutcome;

    const role = await this.store.em.upsert(Role, entity);

    return role.toJSON();
  }
}
