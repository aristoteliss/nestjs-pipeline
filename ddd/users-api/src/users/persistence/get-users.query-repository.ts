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
import { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { GetUsersQuery } from '../cqrs/queries/get-users.query';
import { User } from '../domain/models/user.entity';

@Injectable()
export class GetUsersQueryRepository
  implements IQueryRepository<GetUsersQuery, User[]> {
  constructor(
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) { }

  async find(_query: GetUsersQuery): Promise<User[]> {
    return this.store.em.findAll(User);
  }
}
