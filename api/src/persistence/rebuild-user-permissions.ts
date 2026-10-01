/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { UserPermissionsProjector } from '../auths/persistence/user-permissions.projector.js';
import { User } from '../users/domain/models/user.entity.js';
import { forEachTenantOrm } from './tenant-orms.js';

const BATCH_SIZE = 500;

/** Rebuilds every user's materialized rules in every tenant, one transaction per batch. */
export async function rebuildUserPermissions(): Promise<Map<string, number>> {
  const projector = new UserPermissionsProjector();

  return forEachTenantOrm(async (orm) => {
    const users = await orm.em
      .fork()
      .find(User, {}, { fields: ['id'], orderBy: { id: 'asc' } } as never);
    const ids = users.map((user) => user.id);
    for (let start = 0; start < ids.length; start += BATCH_SIZE) {
      const batch = ids.slice(start, start + BATCH_SIZE);
      await orm.em.fork().transactional((em) => projector.rebuild(em, batch));
    }
    return ids.length;
  });
}
