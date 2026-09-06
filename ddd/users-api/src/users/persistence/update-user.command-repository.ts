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
import { OptimisticLockError } from '@mikro-orm/core';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Cache, CommandRepository, ICache } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { User, UserSnapshot } from '../domain/models/user.entity';

@Injectable()
export class UpdateUserCommandRepository extends CommandRepository<
  User,
  UserSnapshot
> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  @Cache<User, UserSnapshot>(
    (user) => filterCacheKey(User.aggregateName, { id: user.id }),
    null,
    (user) => [filterCacheKey(User.aggregateName, { email: user.email })],
  )
  async save(user: User): Promise<UserSnapshot> {
    const affected = await this.store.em.nativeUpdate(
      User,
      { id: user.id, version: user.getExpectedVersion() },
      {
        username: user.username,
        department: user.department ?? null,
        updatedAt: user.updatedAt,
        version: user.version,
      },
    );

    if (affected === 0) {
      const exists = await this.store.em.findOne(
        User,
        { id: user.id },
        { refresh: true },
      );
      if (exists) {
        throw OptimisticLockError.lockFailedVersionMismatch(
          user,
          user.getExpectedVersion(),
          exists.version,
        );
      }

      throw new NotFoundException('User not found');
    }

    return user.toJSON();
  }
}
