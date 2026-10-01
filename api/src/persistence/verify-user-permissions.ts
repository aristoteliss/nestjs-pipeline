/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { UserPermissionsProjector } from '../auths/persistence/user-permissions.projector.js';
import { forEachTenantOrm } from './tenant-orms.js';

/** Per tenant, the users whose materialized rules differ from their source tables. */
export async function verifyUserPermissions(): Promise<Map<string, string[]>> {
  const projector = new UserPermissionsProjector();
  return forEachTenantOrm((orm) => projector.findDrift(orm.em.fork()));
}
