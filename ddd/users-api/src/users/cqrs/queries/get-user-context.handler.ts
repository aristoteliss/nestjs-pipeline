/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CaslBehavior, type CaslUserContext } from '@nestjs-pipeline/casl';
import { UsePipeline } from '@nestjs-pipeline/core';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core/application';
import { QUERY_REPOSITORY } from '../../persistence/repository.tokens';
import { GetUserContextQuery } from './get-user-context.query';

@QueryHandler(GetUserContextQuery)
@UsePipeline([
  CaslBehavior,
  {
    rules: [{ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER }],
  },
])
export class GetUserContextHandler
  implements IQueryHandler<GetUserContextQuery, CaslUserContext | null>
{
  constructor(
    @Inject(QUERY_REPOSITORY.getUserContext)
    private readonly queryRepository: IQueryRepository<
      GetUserContextQuery,
      CaslUserContext | null
    >,
  ) {}

  async execute(query: GetUserContextQuery): Promise<CaslUserContext | null> {
    return await this.queryRepository.find(query);
  }
}
