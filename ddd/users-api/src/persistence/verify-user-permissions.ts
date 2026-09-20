/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { loadOptionalEnvFile } from '@common/environment/load-optional-env-file';
import { UserPermissionsProjector } from '../auths/persistence/user-permissions.projector';
import { forEachTenantOrm } from './tenant-orms';

/** Per tenant, the users whose materialized rules differ from their source tables. */
export async function verifyUserPermissions(): Promise<Map<string, string[]>> {
  const projector = new UserPermissionsProjector();
  return forEachTenantOrm((orm) => projector.findDrift(orm.em.fork()));
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith('/verify-user-permissions.ts') ||
    process.argv[1].endsWith('/verify-user-permissions.js'))
) {
  (async () => {
    loadOptionalEnvFile();
    let drifted = 0;
    for (const [tenant, userIds] of await verifyUserPermissions()) {
      drifted += userIds.length;
      console.log(
        userIds.length === 0
          ? `${tenant}: no drift.`
          : `${tenant}: drifted user(s): ${userIds.join(', ')}`,
      );
    }
    process.exitCode = drifted > 0 ? 1 : 0;
  })();
}
