/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import type { IQueryRepository } from '@cqrs-ddd/core/application';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CaslAuthorizer, requires } from '@nestjs-pipeline/casl';
import { UsePipeline } from '@nestjs-pipeline/core';
import {
  projectRoleRead,
  type RoleReadModel,
} from '../../application/role-read-model';
import type { Role } from '../../domain/models/role.entity';
import { QUERY_REPOSITORY } from '../../persistence/repository.tokens';
import { GetRolesQuery } from './get-roles.query';

@QueryHandler(GetRolesQuery)
@UsePipeline(requires({ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.ROLE }))
export class GetRolesHandler
  implements IQueryHandler<GetRolesQuery, RoleReadModel[]>
{
  constructor(
    @Inject(QUERY_REPOSITORY.getRoles)
    private readonly queryRepository: IQueryRepository<GetRolesQuery, Role[]>,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(query: GetRolesQuery): Promise<RoleReadModel[]> {
    const roles = await this.queryRepository.find(query);
    return roles
      .filter((role) => this.authorizer.can(APP_ACTIONS.READ, role))
      .map((role) => projectRoleRead(this.authorizer, role));
  }
}
