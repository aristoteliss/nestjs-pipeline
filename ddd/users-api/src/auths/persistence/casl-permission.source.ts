/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { getSessionUserFromStore } from '@common/context/session-user.store';
import { Inject, Injectable, Scope } from '@nestjs/common';
import type {
  CaslAuthorizationInput,
  ICaslPermissionSource,
} from '@nestjs-pipeline/casl';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { User } from '../../users/domain/models/user.entity';
import {
  type IUserPermissionRules,
  USER_PERMISSION_RULES,
} from '../application/ports/user-permission-rules.port';

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
    @Inject(USER_PERMISSION_RULES)
    private readonly permissionRules: IUserPermissionRules,
  ) {}

  async load(): Promise<CaslAuthorizationInput | null> {
    const session = getSessionUserFromStore();
    const id = session?.id?.trim();
    if (!session || !id) return null;

    if (session.principalType === 'service') {
      return session.grants
        ? { principal: { id, principalType: 'service' }, rules: session.grants }
        : null;
    }
    if (session.principalType !== 'user') return null;

    // Rules copied into a verified access token by the JWT authenticator.
    if (session.grants) {
      return {
        principal: {
          id,
          principalType: 'user',
          department: session.department ?? null,
        },
        rules: session.grants,
      };
    }

    const [user, rules] = await Promise.all([
      this.store.em.findOne(User, { id }),
      this.permissionRules.findOrdered(id),
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
