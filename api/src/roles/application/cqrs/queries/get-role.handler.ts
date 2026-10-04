/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants/index.js';
import { IQueryRepository } from '@cqrs-ddd/core/application';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { CaslAuthorizer, requires } from '@cqrs-ddd/pipeline-casl';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Role } from '../../../domain/models/role.entity.js';
import { QUERY_REPOSITORY } from '../../../persistence/repository.tokens.js';
import { projectRoleRead, type RoleReadModel } from '../../role-read-model.js';
import { GetRoleQuery } from './get-role.query.js';

@QueryHandler(GetRoleQuery)
@UsePipeline(requires({ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.ROLE }))
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
      this.authorizer.dependsOnEntity(APP_ACTIONS.READ, APP_SUBJECTS.ROLE) &&
        !query.refresh
        ? new GetRoleQuery(
            { roleId: query.roleId },
            { hydrate: query.hydrate, refresh: true },
            query.sessionPrincipal,
          )
        : query,
    );
    return role ? projectRoleRead(this.authorizer, role) : null;
  }
}
