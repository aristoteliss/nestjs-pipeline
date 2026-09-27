/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { getSessionPrincipal } from '@common/context/session-principal.store';
import { isSessionPrincipalValid } from '@common/types/SessionPrincipal';
import { Inject, Injectable, Scope } from '@nestjs/common';
import type {
  CaslAuthorizationInput,
  ICaslPermissionSource,
} from '@nestjs-pipeline/casl';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { User } from '../../users/domain/models/user.entity';
import { GetUserPermissionRulesQuery } from '../application/cqrs/queries/get-user-permission-rules.query';
import { GetUserPermissionRulesRepository } from './get-user-permission-rules.query-repository';

/**
 * Resolves the authenticated principal and their rules for `CaslBehavior`.
 *
 * Service principals use the grants their authenticator attached; they are never
 * looked up as users. A user whose verified access token carried permissions
 * (`PERMISSIONS_IN_ACCESS_TOKEN`) uses those without any query. Otherwise the
 * user row and the materialized rules (direct rules first) are read in one
 * parallel round-trip, so a deleted user, a changed department or a rebuilt
 * rule set takes effect on the next request.
 * A missing or unclassified principal is unauthenticated.
 */
@Injectable({ scope: Scope.REQUEST })
export class CaslPermissionSource implements ICaslPermissionSource {
  constructor(
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
    private readonly permissionRules: GetUserPermissionRulesRepository,
  ) {}

  async load(): Promise<CaslAuthorizationInput | null> {
    const session = getSessionPrincipal();

    if (!session || !isSessionPrincipalValid(session)) return null;

    if (session.grants) {
      return {
        principal: {
          id: session.id,
          principalType: session.type,
          department: session.department ?? null,
        },
        rules: session.grants,
      };
    }

    if (session.type === 'service') return null;

    const [user, rules] = await Promise.all([
      this.store.em.findOne(User, { id: session.id }),
      this.permissionRules.find(
        new GetUserPermissionRulesQuery(
          { userId: session.id },
          { refresh: true },
        ),
      ),
    ]);

    if (!user) return null;

    return {
      principal: {
        id: user.id,
        principalType: 'user',
        department: user.department ?? null,
      },
      rules,
    };
  }
}
