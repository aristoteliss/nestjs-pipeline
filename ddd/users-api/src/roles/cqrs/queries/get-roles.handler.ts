/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
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
    const roles = rawRoles.map((raw) => Role.from(raw));
    return this.authorizer.filter<RoleSnapshot>('read', roles);
  }
}
