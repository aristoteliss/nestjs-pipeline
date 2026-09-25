/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { loadOptionalEnvFile } from '@common/environment/load-optional-env-file';
import { Auth } from '../auths/domain/models/auth.entity';
import { REFRESH_TOKEN_TTL_SECONDS } from '../common/environment/auth-token.config';
import { forEachTenantOrm } from './tenant-orms';

const BATCH_SIZE = 500;

/**
 * Deletes sessions that expired, or were revoked longer ago than the refresh
 * lifetime, in every tenant. Their rotated-token history goes with them (cascade).
 */
export async function purgeSessions(): Promise<Map<string, number>> {
  const now = Date.now();
  const revokedBefore = now - REFRESH_TOKEN_TTL_SECONDS * 1000;

  return forEachTenantOrm(async (orm) => {
    let purged = 0;
    for (;;) {
      const em = orm.em.fork();
      const batch = await em.find(
        Auth,
        {
          $or: [
            { expiresAt: { $lte: now } },
            { revokedAt: { $ne: null, $lte: revokedBefore } },
          ],
        },
        {
          fields: ['id'],
          limit: BATCH_SIZE,
          disableIdentityMap: true,
        } as never,
      );
      if (batch.length === 0) return purged;
      purged += await em.nativeDelete(Auth, {
        id: { $in: batch.map((auth) => auth.id) },
      });
    }
  });
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith('/purge-sessions.ts') ||
    process.argv[1].endsWith('/purge-sessions.js'))
) {
  (async () => {
    loadOptionalEnvFile();
    for (const [tenant, count] of await purgeSessions()) {
      console.log(`${tenant}: purged ${count} session(s).`);
    }
  })();
}
