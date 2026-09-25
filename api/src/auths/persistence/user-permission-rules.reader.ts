/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import type { Capability } from '@nestjs-pipeline/casl';
import { capabilityFromRow } from '@persistence/capability-row.mapper';
import { UserPermissionRule } from '@persistence/entities/user-permission-rule.entity';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import type { IUserPermissionRules } from '../application/ports/user-permission-rules.port';

/** Reads `user_permission_rules` in the order `ORDER BY inverted, position`. */
@Injectable()
export class UserPermissionRulesReader implements IUserPermissionRules {
  constructor(
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {}

  async findOrdered(userId: string): Promise<Capability[]> {
    const rows = await this.store.em.find(
      UserPermissionRule,
      { userId },
      { orderBy: [{ inverted: 'asc' }, { position: 'asc' }] },
    );
    return rows.map(capabilityFromRow);
  }
}
