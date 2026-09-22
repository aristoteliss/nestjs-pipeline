/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { readDependsOnEntityState } from '@common/cqrs/helpers/read-freshness.helper';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CaslAuthorizer, requires } from '@nestjs-pipeline/casl';
import { logging, UsePipeline } from '@nestjs-pipeline/core';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core/application';
import {
  projectRoleRead,
  type RoleReadModel,
} from '../../application/role-read-model';
import type { Role } from '../../domain/models/role.entity';
import { QUERY_REPOSITORY } from '../../persistence/repository.tokens';
import { GetRoleQuery } from './get-role.query';

@QueryHandler(GetRoleQuery)
@UsePipeline(
  logging({ requestResponseLogLevel: 'log' }),
  requires({ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.ROLE }),
)
export class GetRoleHandler
  implements IQueryHandler<GetRoleQuery, RoleReadModel | null>
{
  constructor(
    @Inject(QUERY_REPOSITORY.getRole)
    private readonly queryRepository: IQueryRepository<
      GetRoleQuery,
      Role | null
    >,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(query: GetRoleQuery): Promise<RoleReadModel | null> {
    const role = await this.queryRepository.find(
      readDependsOnEntityState(APP_SUBJECTS.ROLE) && !query.refresh
        ? new GetRoleQuery(
            { roleId: query.roleId },
            { hydrate: query.hydrate, refresh: true },
            query.sessionUser,
          )
        : query,
    );
    return role ? projectRoleRead(this.authorizer, role) : null;
  }
}
