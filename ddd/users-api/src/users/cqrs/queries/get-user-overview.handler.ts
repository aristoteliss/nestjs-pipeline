/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { Inject, Optional } from '@nestjs/common';
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

export {
  getViewerFromContext,
  hasEntityDependentConditions,
  OVERVIEW_RESPONSE_POLICY_VERSION,
  resolveOverviewPrincipal,
  resolveOverviewScope,
  userOverviewCacheCondition,
  userOverviewCacheKey,
  userOverviewCacheOptions,
} from './user-overview-cache.policy';

export interface UserOverviewDto {
  id?: string;
  username?: string;
  email?: string;
  department?: string | null;
  roles?: (string | null)[];
  capabilities?: (string | null)[];
}

/**
 * Composed query handler for user profile and assigned role capabilities.
 *
 * Pipeline-level caching is partitioned by tenant, principal type/ID, permission
 * scope fingerprint, and request payload digest. Entity-dependent authorization
 * rules bypass response caching to guarantee fresh reauthorization.
 */
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
  private readonly rolesQueryRepository?: IQueryRepository<
    GetRolesQuery,
    Role[]
  >;
  private readonly authorizer: CaslAuthorizer;

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
    @Optional()
    @Inject(ROLES_QUERY_REPOSITORY.getRoles)
    rolesRepoOrAuthorizer?:
      | IQueryRepository<GetRolesQuery, Role[]>
      | CaslAuthorizer,
    authorizer?: CaslAuthorizer,
  ) {
    if (
      rolesRepoOrAuthorizer instanceof CaslAuthorizer ||
      (rolesRepoOrAuthorizer != null &&
        !('find' in rolesRepoOrAuthorizer) &&
        ('authorize' in rolesRepoOrAuthorizer ||
          'can' in rolesRepoOrAuthorizer ||
          'project' in rolesRepoOrAuthorizer))
    ) {
      this.rolesQueryRepository = undefined;
      this.authorizer = rolesRepoOrAuthorizer as unknown as CaslAuthorizer;
    } else {
      this.rolesQueryRepository = rolesRepoOrAuthorizer as unknown as
        | IQueryRepository<GetRolesQuery, Role[]>
        | undefined;
      this.authorizer = authorizer ?? new CaslAuthorizer();
    }
  }

  async execute(query: GetUserOverviewQuery): Promise<UserOverviewDto | null> {
    // 1. Authoritative user load directly from primary persistence
    const user = await this.userQueryRepository.find(
      new GetUserQuery({ userId: query.userId }, { refresh: true }),
    );
    if (!user) {
      return null;
    }

    // 2. Authorize loaded user aggregate (fails fast on entity-level denial)
    const authorized = this.authorizer.authorize<Record<string, unknown>>(
      'read',
      user,
    );

    // 3. Pre-check read permissions on user roles and capabilities
    const canReadUserRoles = this.authorizer.can('read', user, 'roles');
    const canReadUserCapabilities = this.authorizer.can(
      'read',
      user,
      'capabilities',
    );

    let authorizedRoles: string[] | undefined;
    let authorizedCapabilities: string[] | undefined;

    // 4. Load and authorize related roles and capabilities
    if (canReadUserRoles || canReadUserCapabilities) {
      const userCaps = await this.capabilitiesQueryRepository.find(
        new GetUserCapabilitiesQuery({ userId: query.userId }),
      );

      if (canReadUserRoles && userCaps?.roles && userCaps.roles.length > 0) {
        if (this.rolesQueryRepository) {
          const roleAggregates = await this.rolesQueryRepository.find(
            new GetRolesQuery({ names: userCaps.roles }),
          );
          const rolesByName = new Map(roleAggregates.map((r) => [r.name, r]));
          authorizedRoles = userCaps.roles.filter((name) => {
            const role = rolesByName.get(name);
            if (role) {
              return (
                this.authorizer.can('read', role) &&
                this.authorizer.can('read', role, 'name')
              );
            }
            return (
              this.authorizer.can('read', APP_SUBJECTS.ROLE) &&
              this.authorizer.can('read', APP_SUBJECTS.ROLE, 'name')
            );
          });
        } else {
          authorizedRoles = userCaps.roles.filter(
            () =>
              this.authorizer.can('read', APP_SUBJECTS.ROLE) &&
              this.authorizer.can('read', APP_SUBJECTS.ROLE, 'name'),
          );
        }
      } else if (canReadUserRoles) {
        authorizedRoles = [];
      }

      if (canReadUserCapabilities) {
        authorizedCapabilities = (userCaps?.additionalCapabilities ?? []).map(
          (c) => (typeof c === 'string' ? c : `${c.subject}:${c.action}`),
        );
      }
    }

    // 5. Assemble candidate overview from authorized projection
    const candidate: Record<string, unknown> = {};
    if ('id' in authorized && authorized.id !== undefined) {
      candidate.id = String(authorized.id);
    }
    if ('username' in authorized && typeof authorized.username === 'string') {
      candidate.username = authorized.username;
    }
    if ('email' in authorized && typeof authorized.email === 'string') {
      candidate.email = authorized.email;
    }
    if (
      'department' in authorized &&
      (typeof authorized.department === 'string' ||
        authorized.department === null)
    ) {
      candidate.department = authorized.department;
    }
    if (authorizedRoles !== undefined) {
      candidate.roles = authorizedRoles;
    }
    if (authorizedCapabilities !== undefined) {
      candidate.capabilities = authorizedCapabilities;
    }

    // 6. Project candidate through authorizer to apply field and descendant masks
    if (typeof this.authorizer.project === 'function') {
      return this.authorizer.project<UserOverviewDto>('read', user, candidate);
    }

    return candidate as UserOverviewDto;
  }
}
