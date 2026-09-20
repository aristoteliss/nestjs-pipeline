/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { readDependsOnEntityState } from '@common/cqrs/helpers/read-freshness.helper';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CaslAuthorizer, requires } from '@nestjs-pipeline/casl';
import { UsePipeline } from '@nestjs-pipeline/core';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core/application';
import {
  projectUserRead,
  type UserReadModel,
} from '../../application/user-read-model';
import type { User } from '../../domain/models/user.entity';
import { QUERY_REPOSITORY } from '../../persistence/repository.tokens';
import { GetUserQuery } from './get-user.query';

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
      readDependsOnEntityState(APP_SUBJECTS.USER) && !query.refresh
        ? new GetUserQuery(
            {
              userId: query.userId,
              email: query.email,
              department: query.department,
            },
            { hydrate: query.hydrate, refresh: true },
            query.sessionUser,
          )
        : query,
    );
    return user ? projectUserRead(this.authorizer, user) : null;
  }
}
