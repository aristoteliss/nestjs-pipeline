/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import type { IQueryRepository } from '@cqrs-ddd/core/application';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { type Capability, requires } from '@nestjs-pipeline/casl';
import { UsePipeline } from '@nestjs-pipeline/core';
import { QUERY_REPOSITORY } from '../../../persistence/repository.tokens';
import { GetUserPermissionRulesQuery } from './get-user-permission-rules.query';

@QueryHandler(GetUserPermissionRulesQuery)
@UsePipeline(requires({ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER }))
export class GetUserPermissionRulesHandler
  implements IQueryHandler<GetUserPermissionRulesQuery, Capability[]>
{
  constructor(
    @Inject(QUERY_REPOSITORY.getUserPermissionRules)
    private readonly queryRepository: IQueryRepository<
      GetUserPermissionRulesQuery,
      Capability[]
    >,
  ) {}

  async execute(query: GetUserPermissionRulesQuery): Promise<Capability[]> {
    return this.queryRepository.find(query);
  }
}
