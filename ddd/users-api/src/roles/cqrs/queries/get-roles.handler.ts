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

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  CaslAuthorizer,
  CaslBehavior,
  UnauthorizedActionException,
} from '@nestjs-pipeline/casl';
import { UsePipeline } from '@nestjs-pipeline/core';
import type { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { Role, type RoleSnapshot } from '../../domain/models/role.entity';
import { QUERY_REPOSITORY } from '../../persistence/repository.tokens';
import { GetRolesQuery } from './get-roles.query';

@QueryHandler(GetRolesQuery)
@UsePipeline([
  CaslBehavior,
  {
    rules: [{ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.ROLE }],
  },
])
export class GetRolesHandler
  implements IQueryHandler<GetRolesQuery, RoleSnapshot[]>
{
  constructor(
    @Inject(QUERY_REPOSITORY.getRoles)
    private readonly queryRepository: IQueryRepository<GetRolesQuery, Role[]>,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(query: GetRolesQuery): Promise<RoleSnapshot[]> {
    const rawRoles = await this.queryRepository.find(query);
    const result: RoleSnapshot[] = [];
    for (const raw of rawRoles) {
      const role = Role.from(raw);
      if (!role) continue;
      try {
        result.push(this.authorizer.authorize('read', role) as RoleSnapshot);
      } catch (err) {
        if (!(err instanceof UnauthorizedActionException)) {
          throw err;
        }
      }
    }
    return result;
  }
}
