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

import { describe, expect, it } from 'vitest';
import { Migration20260501010000 } from './migrations/Migration20260501010000';

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;

async function migrationSql(direction: 'up' | 'down'): Promise<string[]> {
  const migration = new Migration20260501010000(
    undefined as never,
    undefined as never,
  );

  await migration[direction]();

  return migration.getQueries().map((query) => {
    expect(typeof query).toBe('string');
    return query as string;
  });
}

function seedIds(queries: string[]): string[] {
  return [
    ...new Set(queries.flatMap((query) => query.match(UUID_PATTERN) ?? [])),
  ].sort();
}

describe('Migration20260501010000', () => {
  it('uses the same stable seed IDs in every run', async () => {
    const firstRunIds = seedIds(await migrationSql('up'));
    const secondRunIds = seedIds(await migrationSql('up'));

    expect(firstRunIds).toHaveLength(27);
    expect(secondRunIds).toEqual(firstRunIds);
  });

  it('rolls back only rows identified by the stable seed IDs', async () => {
    const upIds = seedIds(await migrationSql('up'));
    const downQueries = await migrationSql('down');
    const downSql = downQueries.join('\n');

    expect(downQueries).not.toHaveLength(0);
    expect(downQueries.every((query) => /\bwhere\b/i.test(query))).toBe(true);
    expect(downSql).not.toMatch(/delete from [a-z_]+\s*;/i);
    expect(downSql).not.toContain('delete from auth');
    expect(downSql).not.toContain('delete from user_denied_capabilities');
    expect(seedIds(downQueries)).toEqual(upIds);
  });

  it('uses placeholders supported by the flat CASL user context', async () => {
    const upSql = (await migrationSql('up')).join('\n');

    expect(upSql).not.toContain('${sessionUser.');
    expect(upSql.match(/\$\{user\.department\}/g)).toHaveLength(4);
    expect(upSql.match(/\$\{user\.id\}/g)).toHaveLength(2);
  });
});
