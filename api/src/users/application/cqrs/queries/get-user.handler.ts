/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants/index.js';
import { IQueryRepository } from '@cqrs-ddd/core/application';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CaslAuthorizer, requires } from '@nestjs-pipeline/casl';
import { UsePipeline } from '@nestjs-pipeline/core';
import type { User } from '../../../domain/models/user.entity.js';
import { QUERY_REPOSITORY } from '../../../persistence/repository.tokens.js';
import { projectUserRead, type UserReadModel } from '../../user-read-model.js';
import { GetUserQuery } from './get-user.query.js';

@QueryHandler(GetUserQuery)
@UsePipeline(requires({ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER }))
export class GetUserHandler
  implements IQueryHandler<GetUserQuery, UserReadModel | null>
{
  constructor(
    @Inject(QUERY_REPOSITORY.getUser)
    private readonly queryRepository: IQueryRepository<
      GetUserQuery,
      User | null
    >,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(query: GetUserQuery): Promise<UserReadModel | null> {
    const user = await this.queryRepository.find(
      this.authorizer.dependsOnEntity(APP_ACTIONS.READ, APP_SUBJECTS.USER) &&
        !query.refresh
        ? new GetUserQuery(
            {
              userId: query.userId,
              email: query.email,
              department: query.department,
            },
            { hydrate: query.hydrate, refresh: true },
            query.sessionPrincipal,
          )
        : query,
    );
    return user ? projectUserRead(this.authorizer, user) : null;
  }
}
