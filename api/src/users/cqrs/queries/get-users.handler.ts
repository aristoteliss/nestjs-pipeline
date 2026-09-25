/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import type { IQueryRepository } from '@cqrs-ddd/core/application';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CaslAuthorizer, requires } from '@nestjs-pipeline/casl';
import { UsePipeline } from '@nestjs-pipeline/core';
import {
  projectUserRead,
  type UserReadModel,
} from '../../application/user-read-model';
import type { User } from '../../domain/models/user.entity';
import { QUERY_REPOSITORY } from '../../persistence/repository.tokens';
import { GetUsersQuery } from './get-users.query';

@QueryHandler(GetUsersQuery)
@UsePipeline(requires({ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER }))
export class GetUsersHandler
  implements IQueryHandler<GetUsersQuery, UserReadModel[]>
{
  constructor(
    @Inject(QUERY_REPOSITORY.getUsers)
    private readonly queryRepository: IQueryRepository<GetUsersQuery, User[]>,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(query: GetUsersQuery): Promise<UserReadModel[]> {
    const users = await this.queryRepository.find(query);
    return users
      .filter((user) => this.authorizer.can(APP_ACTIONS.READ, user))
      .map((user) => projectUserRead(this.authorizer, user));
  }
}
