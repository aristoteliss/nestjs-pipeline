/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { MikroORM } from '@mikro-orm/core';
import { LibSqlDriver } from '@mikro-orm/libsql';
import { Migrator } from '@mikro-orm/migrations';
import { AuthSchema } from './schemas/auth.schema';
import { CacheSchema } from './schemas/cache.schema';
import { CapabilitySchema } from './schemas/capability.schema';
import { RoleSchema } from './schemas/role.schema';
import { RoleCapabilitySchema } from './schemas/role-capability.schema';
import { UserSchema } from './schemas/user.schema';
import { UserAdditionalCapabilitySchema } from './schemas/user-additional-capability.schema';
import { UserDeniedCapabilitySchema } from './schemas/user-denied-capability.schema';
import { UserRoleSchema } from './schemas/user-role.schema';

function parseSteps(argv: string[]): number {
  const args = argv.slice(2);

  const inline = args.find((arg) => arg.startsWith('--steps='));
  if (inline) {
    const value = Number.parseInt(inline.split('=')[1] ?? '', 10);
    if (!Number.isNaN(value) && value > 0) {
      return value;
    }
    throw new Error('--steps must be a positive integer.');
  }

  const stepsIndex = args.indexOf('--steps');
  if (stepsIndex >= 0) {
    const next = args[stepsIndex + 1];
    const value = Number.parseInt(next ?? '', 10);
    if (!Number.isNaN(value) && value > 0) {
      return value;
    }
    throw new Error('--steps must be a positive integer.');
  }

  const positional = args.find((arg) => /^\d+$/.test(arg));
  if (positional) {
    return Number.parseInt(positional, 10);
  }

  return 1;
}

export async function revert(steps = 1): Promise<number> {
  const orm = await MikroORM.init({
    driver: LibSqlDriver,
    dbName: process.env.DATABASE_URL ?? 'file:local.db',
    password: process.env.AUTH_TOKEN,
    entities: [
      UserSchema,
      AuthSchema,
      RoleSchema,
      CapabilitySchema,
      RoleCapabilitySchema,
      UserRoleSchema,
      UserAdditionalCapabilitySchema,
      UserDeniedCapabilitySchema,
      CacheSchema,
    ],
    extensions: [Migrator],
    migrations: {
      path: 'dist/persistence/migrations',
      pathTs: 'src/persistence/migrations',
      glob: '!(*.d).{js,ts}',
    },
  });

  try {
    let revertedCount = 0;

    for (let i = 0; i < steps; i += 1) {
      const reverted = await orm.migrator.down();
      const count = Array.isArray(reverted) ? reverted.length : 0;

      if (count === 0) {
        break;
      }

      revertedCount += count;
    }

    return revertedCount;
  } finally {
    await orm.close();
  }
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith('/revert.ts') ||
    process.argv[1].endsWith('/revert.js'))
) {
  (async () => {
    process.loadEnvFile();
    const steps = parseSteps(process.argv);
    const reverted = await revert(steps);
    console.log(
      reverted > 0
        ? `Done - ${reverted} migration(s) reverted.`
        : 'Nothing to revert.',
    );
  })();
}
