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

import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CaslBehavior } from '@nestjs-pipeline/casl';
import { UsePipeline } from '@nestjs-pipeline/core';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import type { User, UserSnapshot } from '../../domain/models/user.entity';
import { QUERY_REPOSITORY } from '../../repositories/repository.tokens';
import { GetUsersQuery } from './get-users.query';
import { authorizeUserRead } from './user-read-authorization.helper';

@QueryHandler(GetUsersQuery)
@UsePipeline([
  CaslBehavior,
  {
    rules: [{ action: 'read', subject: 'User' }],
  },
])
export class GetUsersHandler
  implements IQueryHandler<GetUsersQuery, UserSnapshot[]>
{
  constructor(
    @Inject(QUERY_REPOSITORY.getUsers)
    private readonly queryRepository: IQueryRepository<GetUsersQuery, User[]>,
  ) {}

  async execute(query: GetUsersQuery): Promise<UserSnapshot[]> {
    const users = await this.queryRepository.find(query);
    return users
      .map((user) => authorizeUserRead(user, { omitUnauthorized: true }))
      .filter((user): user is UserSnapshot => user !== null);
  }
}
