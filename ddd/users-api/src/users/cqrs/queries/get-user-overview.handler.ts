/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CacheBehavior } from '@nestjs-pipeline/cache';
import {
  CaslAuthorizer,
  CaslBehavior,
  type UserCapabilities,
} from '@nestjs-pipeline/casl';
import { UsePipeline } from '@nestjs-pipeline/core';
import type { IQueryRepository } from '@nestjs-pipeline/ddd-core/application';
import { GetUserCapabilitiesQuery } from '../../../auths/cqrs/queries/get-user-capabilities.query';
import { GetRolesQuery } from '../../../roles/cqrs/queries/get-roles.query';
import type { Role } from '../../../roles/domain/models/role.entity';
import { QUERY_REPOSITORY as ROLES_QUERY_REPOSITORY } from '../../../roles/persistence/repository.tokens';
import type { User } from '../../domain/models/user.entity';
import { QUERY_REPOSITORY } from '../../persistence/repository.tokens';
import { GetUserQuery } from './get-user.query';
import { GetUserOverviewQuery } from './get-user-overview.query';
import { userOverviewCacheOptions } from './user-overview-cache.policy';

export interface UserOverviewDto {
  id?: string;
  username?: string;
  email?: string;
  department?: string | null;
  roles?: (string | null)[];
  capabilities?: (string | null)[];
}

@QueryHandler(GetUserOverviewQuery)
@UsePipeline(
  [
    CaslBehavior,
    {
      rules: [{ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER }],
    },
  ],
  [CacheBehavior, userOverviewCacheOptions],
)
export class GetUserOverviewHandler
  implements IQueryHandler<GetUserOverviewQuery, UserOverviewDto | null>
{
  constructor(
    @Inject(QUERY_REPOSITORY.getUser)
    private readonly users: IQueryRepository<GetUserQuery, User | null>,
    @Inject(QUERY_REPOSITORY.getUserCapabilities)
    private readonly capabilities: IQueryRepository<
      GetUserCapabilitiesQuery,
      UserCapabilities
    >,
    @Inject(ROLES_QUERY_REPOSITORY.getRoles)
    private readonly roles: IQueryRepository<GetRolesQuery, Role[]>,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(query: GetUserOverviewQuery): Promise<UserOverviewDto | null> {
    const user = await this.users.find(
      new GetUserQuery({ userId: query.userId }, { refresh: true }),
    );
    if (!user) return null;

    const profile = this.authorizer.authorize('read', user, {
      select: ['id', 'username', 'email', 'department'],
    });

    const includeRoles = this.authorizer.can('read', user, 'roles');
    const includeCapabilities = this.authorizer.can(
      'read',
      user,
      'capabilities',
    );
    if (!includeRoles && !includeCapabilities) {
      return this.authorizer.project('read', user, profile);
    }

    const assignments = await this.capabilities.find(
      new GetUserCapabilitiesQuery({ userId: query.userId }),
    );

    return this.authorizer.project<UserOverviewDto>('read', user, {
      ...profile,
      ...(includeRoles && {
        roles: await this.readableRoleNames(assignments?.roles ?? []),
      }),
      ...(includeCapabilities && {
        capabilities: (assignments?.additionalCapabilities ?? []).map(
          (capability) =>
            typeof capability === 'string'
              ? capability
              : `${capability.subject}:${capability.action}`,
        ),
      }),
    });
  }

  private async readableRoleNames(names: string[]): Promise<string[]> {
    if (names.length === 0) return [];

    const loaded = await this.roles.find(new GetRolesQuery({ names }));
    const byName = new Map(loaded.map((role) => [role.name, role]));

    return names.filter((name) => {
      const role = byName.get(name);
      return (
        role !== undefined &&
        this.authorizer.can('read', role) &&
        this.authorizer.can('read', role, 'name')
      );
    });
  }
}
