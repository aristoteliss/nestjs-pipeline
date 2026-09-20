/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  APP_ACTIONS,
  APP_SUBJECTS,
  userCapabilitiesSubject,
} from '@common/constants';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CacheBehavior } from '@nestjs-pipeline/cache';
import {
  type Capability,
  type CapabilityString,
  CaslAuthorizer,
  type Projected,
  requires,
} from '@nestjs-pipeline/casl';
import { UsePipeline } from '@nestjs-pipeline/core';
import type { IQueryRepository } from '@nestjs-pipeline/ddd-core/application';
import type { UserPermissionAssignments } from '../../../auths/application/permission-assignments';
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
  requires({ action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER }),
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
      UserPermissionAssignments
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
    this.authorizer.authorize(APP_ACTIONS.READ, user);

    const candidate: UserOverviewDto = {
      id: user.id,
      username: user.username,
      email: user.email,
      department: user.department,
      ...(await this.readablePermissions(user.id)),
    };

    return this.authorizer.project('read', user, candidate);
  }

  private async readablePermissions(
    userId: string,
  ): Promise<Pick<UserOverviewDto, 'roles' | 'capabilities'>> {
    const permissions = userCapabilitiesSubject(userId);
    if (!this.authorizer.can(APP_ACTIONS.READ, permissions)) return {};

    const assignments = await this.capabilities.find(
      new GetUserCapabilitiesQuery({ userId }),
    );
    const readable = this.authorizer.project(APP_ACTIONS.READ, permissions, {
      roles: assignments?.roles ?? [],
      additionalCapabilities: assignments?.additionalCapabilities ?? [],
    });

    return {
      ...(readable.roles
        ? { roles: await this.readableRoleNames(readable.roles) }
        : {}),
      ...(readable.additionalCapabilities
        ? { capabilities: readable.additionalCapabilities.map(capabilityLabel) }
        : {}),
    };
  }

  private async readableRoleNames(
    names: readonly (string | null | undefined)[],
  ): Promise<(string | null)[]> {
    const wanted = names.filter(
      (name): name is string => typeof name === 'string',
    );
    if (wanted.length === 0) return names.map(() => null);

    const loaded = await this.roles.find(new GetRolesQuery({ names: wanted }));
    const byName = new Map(loaded.map((role) => [role.name, role]));

    return names
      .map((name) => (typeof name === 'string' ? name : null))
      .filter((name) => {
        if (name === null) return true;
        const role = byName.get(name);
        return (
          role !== undefined &&
          this.authorizer.can(APP_ACTIONS.READ, role) &&
          this.authorizer.can(APP_ACTIONS.READ, role, 'name')
        );
      });
  }
}

function capabilityLabel(
  entry: Projected<Capability | CapabilityString> | null | undefined,
): string | null {
  if (entry === null || entry === undefined) return null;
  if (typeof entry === 'string') return entry;
  return typeof entry.subject === 'string' && typeof entry.action === 'string'
    ? `${entry.subject}:${entry.action}`
    : null;
}
