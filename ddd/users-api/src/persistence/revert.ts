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

import { loadOptionalEnvFile } from '@common/environment/load-optional-env-file';
import { MikroORM } from '@mikro-orm/core';
import { LibSqlDriver } from '@mikro-orm/libsql';
import {
  createLibsqlOrmOptions,
  resolveLibsqlDbUrl,
  resolveLibsqlTenants,
} from './libsql-options';
import {
  createPostgresOrmOptions,
  normalizeSchemaName,
} from './postgres-options';

function isPostgresEngine(): boolean {
  return (process.env.DB_ENGINE ?? '').toLowerCase() === 'postgres';
}

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

function parseSchemas(): string[] {
  const list = process.env.TENANT_SCHEMAS ?? process.env.DB_DEFAULT_SCHEMA;
  if (!list) {
    return [normalizeSchemaName(undefined)];
  }

  return list
    .split(',')
    .map((value) => normalizeSchemaName(value))
    .filter((value, index, all) => all.indexOf(value) === index);
}

async function revertSchema(schema: string, steps: number): Promise<number> {
  const orm = await MikroORM.init(createPostgresOrmOptions(schema));

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

async function revertLibsqlTenant(
  tenant: string,
  steps: number,
): Promise<number> {
  const dbName = resolveLibsqlDbUrl(tenant);
  const orm = await MikroORM.init<LibSqlDriver>(createLibsqlOrmOptions(dbName));

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

async function revertLibsql(steps: number): Promise<number> {
  const tenants = resolveLibsqlTenants();
  let total = 0;

  for (const tenant of tenants) {
    total += await revertLibsqlTenant(tenant, steps);
  }

  return total;
}

export async function revert(steps = 1): Promise<number> {
  if (!isPostgresEngine()) {
    return revertLibsql(steps);
  }

  const schemas = parseSchemas();
  let total = 0;

  for (const schema of schemas) {
    total += await revertSchema(schema, steps);
  }

  return total;
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith('/revert.ts') ||
    process.argv[1].endsWith('/revert.js'))
) {
  (async () => {
    loadOptionalEnvFile();
    const steps = parseSteps(process.argv);
    const reverted = await revert(steps);
    console.log(
      reverted > 0
        ? `Done - ${reverted} migration(s) reverted.`
        : 'Nothing to revert.',
    );
  })();
}
