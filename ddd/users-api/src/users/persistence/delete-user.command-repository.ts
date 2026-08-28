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

  @Cache(
    null,
    (outcome) => [
      filterCacheKey(User, { _id: outcome.entity.id }),
      filterCacheKey(User, { email: outcome.entity.email }),
    ],
  )
  async save(domainOutcome: UserUpdateOutcome): Promise<null> {
    const { entity } = domainOutcome;
    const em = this.store.em;

    // The junction cleanup and aggregate delete are one logical operation.
    // Keep them on one EntityManager/transaction so a later failure cannot
    // leave the user with only part of its authorization relations removed.
    await em.transactional(async (tx) => {
      await tx.execute('DELETE FROM user_roles WHERE user_id = ?', [entity.id]);
      await tx.execute(
        'DELETE FROM user_additional_capabilities WHERE user_id = ?',
        [entity.id],
      );
      await tx.execute(
        'DELETE FROM user_denied_capabilities WHERE user_id = ?',
        [entity.id],
      );
      await tx.nativeDelete(User, entity.id);
    });

    return null;
  }
}
