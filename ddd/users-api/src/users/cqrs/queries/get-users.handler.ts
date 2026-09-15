/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
import { UsePipeline } from '@nestjs-pipeline/core';
import type { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { User, type UserSnapshot } from '../../domain/models/user.entity';
import { QUERY_REPOSITORY } from '../../persistence/repository.tokens';
import { GetUsersQuery } from './get-users.query';

@QueryHandler(GetUsersQuery)
@UsePipeline([
  CaslBehavior,
  {
    rules: [{ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER }],
  },
])
export class GetUsersHandler
  implements IQueryHandler<GetUsersQuery, UserSnapshot[]>
{
  constructor(
    @Inject(QUERY_REPOSITORY.getUsers)
    private readonly queryRepository: IQueryRepository<GetUsersQuery, User[]>,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(query: GetUsersQuery): Promise<UserSnapshot[]> {
    const rawUsers = await this.queryRepository.find(query);
    const users = rawUsers.map((raw) => User.from(raw));
    return this.authorizer.filter<UserSnapshot>('read', users);
  }
}
