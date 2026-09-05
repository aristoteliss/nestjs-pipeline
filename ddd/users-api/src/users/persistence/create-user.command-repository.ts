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
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { Cache, CommandRepository, ICache } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { UniqueEmailException } from '../domain/models/errors/email.exception';
import { User, UserSnapshot } from '../domain/models/user.entity';
import { UserCreateOutcome } from '../domain/outcomes/user-create.outcome';

@Injectable()
export class CreateUserCommandRepository extends CommandRepository<UserCreateOutcome> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  @Cache((outcome) =>
    filterCacheKey(User.aggregateName, { id: outcome.entity.id }),
  )
  async save(domainOutcome: UserCreateOutcome): Promise<UserSnapshot> {
    const { entity } = domainOutcome;
    const em = this.store.em;

    try {
      const user = em.create(User, entity);
      em.persist(user);
      await em.flush();

      return user.toJSON();
    } catch (err: unknown) {
      if (
        err instanceof UniqueConstraintViolationException ||
        (typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          err.code === 'SQLITE_CONSTRAINT_UNIQUE') ||
        (err instanceof Error &&
          (err.message.includes('UNIQUE') ||
            err.message.includes('unique') ||
            err.message.includes('SQLITE_CONSTRAINT_UNIQUE')))
      ) {
        throw new UniqueEmailException(entity);
      }
      throw err;
    }
  }
}
