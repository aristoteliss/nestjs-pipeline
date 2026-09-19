/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CaslBehavior, type CaslUserContext } from '@nestjs-pipeline/casl';
import { UsePipeline } from '@nestjs-pipeline/core';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { QUERY_REPOSITORY } from '../../persistence/repository.tokens';
import { GetUserContextQuery } from './get-user-context.query';

/**
 * Loads the authorization context of a user.
 *
 * The handler is authorized rather than open. It is registered on the QueryBus,
 * so anything that can dispatch a query could previously read any user's
 * authorization context by ID — and its return type, `CaslUserContext`, is the
 * shape that carries roles and capabilities. The repository behind it is narrow
 * today, which limited the exposure but did not bound it: widening the
 * repository is exactly what the type invites.
 *
 * Reading another principal's authorization context is a `read` on `User`, so it
 * is gated by the same rule as reading the user itself.
 */
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
