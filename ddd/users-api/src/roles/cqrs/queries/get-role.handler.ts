/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core/application';
import type { Role, RoleSnapshot } from '../../domain/models/role.entity';
import { QUERY_REPOSITORY } from '../../persistence/repository.tokens';
import { GetRoleQuery } from './get-role.query';

@QueryHandler(GetRoleQuery)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [
    CaslBehavior,
    {
      rules: [{ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.ROLE }],
    },
  ],
)
export class GetRoleHandler
  implements IQueryHandler<GetRoleQuery, RoleSnapshot | null>
{
  constructor(
    @Inject(QUERY_REPOSITORY.getRole)
    private readonly queryRepository: IQueryRepository<
      GetRoleQuery,
      Role | null
    >,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(query: GetRoleQuery): Promise<RoleSnapshot | null> {
    const role = await this.queryRepository.find(query);
    return role ? this.authorizer.authorize<RoleSnapshot>('read', role) : null;
  }
}
