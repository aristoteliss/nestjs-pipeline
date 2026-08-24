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

import { filterCacheKey } from '@common/cqrs/helpers/filterCacheKey.helper';
import { Inject, Injectable } from '@nestjs/common';
import { Cache, CommandRepository, ICache } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { User, UserSnapshot } from '../domain/models/user.entity';
import { UserUpdateOutcome } from '../domain/outcomes/user-update.outcome';

@Injectable()
export class DeleteUserCommandRepository extends CommandRepository<UserUpdateOutcome> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  @Cache()
  async save(domainOutcome: UserUpdateOutcome): Promise<number> {
    const { entity } = domainOutcome;

    // Invalidate in-memory cache
    await this.cache?.delete(filterCacheKey(User, { _id: entity.id }));
    if (entity.email) {
      await this.cache?.delete(filterCacheKey(User, { email: entity.email }));
    }

    // Clean up junction tables first to prevent foreign key constraint violations
    await this.store.em.execute('DELETE FROM user_roles WHERE user_id = ?', [
      entity.id,
    ]);
    await this.store.em.execute(
      'DELETE FROM user_additional_capabilities WHERE user_id = ?',
      [entity.id],
    );
    await this.store.em.execute(
      'DELETE FROM user_denied_capabilities WHERE user_id = ?',
      [entity.id],
    );

    const result = await this.store.em.nativeDelete(User, entity.id);

    return result;
  }
}
