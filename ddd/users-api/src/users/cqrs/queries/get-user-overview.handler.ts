/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import type { SessionUser } from '@common/types/SessionUser';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  CacheBehavior,
  createPartitionedCacheKeyFactory,
} from '@nestjs-pipeline/cache';
import { CaslBehavior, type UserCapabilities } from '@nestjs-pipeline/casl';
import { UsePipeline } from '@nestjs-pipeline/core';
import type { IQueryRepository } from '@nestjs-pipeline/ddd-core/application';
import { GetUserCapabilitiesQuery } from '../../../auths/cqrs/queries/get-user-capabilities.query';
import type { User } from '../../domain/models/user.entity';
import { QUERY_REPOSITORY } from '../../persistence/repository.tokens';
import { GetUserQuery } from './get-user.query';
import { GetUserOverviewQuery } from './get-user-overview.query';

export interface UserOverviewDto {
  id: string;
  username: string;
  email: string;
  department: string | null;
  roles: string[];
  capabilities: string[];
}

export const userOverviewCacheKey = createPartitionedCacheKeyFactory({
  principal: (ctx) => (ctx.items.get('user') as SessionUser | undefined)?.id,
  scope: (ctx) =>
    (ctx.items.get('user') as SessionUser | undefined)?.capabilities?.roles
      ?.slice()
      .sort()
      .join(','),
});

/**
 * Exemplary query handler demonstrating optimal usage of CacheBehavior.
 *
 * This handler assembles a composed read model combining user profile state
 * and assigned role capabilities from separate repository ports. Because it
 * produces a final composed application representation rather than a single
 * aggregate root, pipeline-level response caching with partition keys
 * is the natural fit:
 * 1. Type-level authorization (CaslBehavior) guards execution before cache evaluation.
 * 2. createPartitionedCacheKeyFactory isolates cache hits by tenant, viewer principal,
 *    and caller role/permission scope.
 * 3. On a cache hit, multi-repository composition is completely short-circuited.
 */
@QueryHandler(GetUserOverviewQuery)
@UsePipeline(
  [
    CaslBehavior,
    {
      rules: [{ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER }],
    },
  ],
  [
    CacheBehavior,
    {
      ttl: 60_000,
      key: userOverviewCacheKey,
    },
  ],
)
export class GetUserOverviewHandler
  implements IQueryHandler<GetUserOverviewQuery, UserOverviewDto | null>
{
  constructor(
    @Inject(QUERY_REPOSITORY.getUser)
    private readonly userQueryRepository: IQueryRepository<
      GetUserQuery,
      User | null
    >,
    @Inject(QUERY_REPOSITORY.getUserCapabilities)
    private readonly capabilitiesQueryRepository: IQueryRepository<
      GetUserCapabilitiesQuery,
      UserCapabilities
    >,
  ) {}

  async execute(query: GetUserOverviewQuery): Promise<UserOverviewDto | null> {
    const user = await this.userQueryRepository.find(
      new GetUserQuery({ userId: query.userId }),
    );
    if (!user) {
      return null;
    }

    const capabilities = await this.capabilitiesQueryRepository.find(
      new GetUserCapabilitiesQuery({ userId: query.userId }),
    );

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      department: user.department,
      roles: capabilities?.roles ?? [],
      capabilities: (capabilities?.additionalCapabilities ?? []).map((c) =>
        typeof c === 'string' ? c : `${c.subject}:${c.action}`,
      ),
    };
  }
}
