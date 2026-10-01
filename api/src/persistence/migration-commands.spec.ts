/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MikroORM } from '@mikro-orm/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from './migrate.js';
import { revert } from './revert.js';

vi.mock('@mikro-orm/core', () => ({ MikroORM: { init: vi.fn() } }));
vi.mock('./orm-options.js', () => ({
  createPostgresOrmOptions: (schema: string) => ({ schema }),
  createLibsqlOrmOptions: (dbName: string, tenant: string) => ({
    dbName,
    tenant,
  }),
  libsqlDbUrl: (tenant: string) => `file:${tenant}.db`,
}));

function orm() {
  const execute = vi.fn().mockResolvedValue(undefined);
  return {
    em: { getConnection: () => ({ execute }) },
    migrator: {
      up: vi.fn().mockResolvedValue(['migration']),
      down: vi.fn().mockResolvedValue([]),
    },
    close: vi.fn().mockResolvedValue(undefined),
    execute,
  };
}

describe('migration commands', () => {
  beforeEach(() => {
    vi.stubEnv('DB_ENGINE', 'postgres');
    vi.stubEnv('TENANT_SCHEMAS', 'alpha,beta,alpha');
    vi.stubEnv('DB_DEFAULT_SCHEMA', 'alpha');
    vi.stubEnv('SQLITE_TENANTS', 'beta');
    vi.mocked(MikroORM.init).mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each(['postgres', 'libsql'])(
    'migrates every %s tenant with an ORM seeding for that tenant',
    async (engine) => {
      vi.stubEnv('DB_ENGINE', engine);
      const first = orm();
      const second = orm();
      vi.mocked(MikroORM.init)
        .mockResolvedValueOnce(first as never)
        .mockResolvedValueOnce(second as never);
      first.migrator.up.mockResolvedValue(['one', 'two']);
      second.migrator.up.mockImplementation(async () => {
        expect(first.close).toHaveBeenCalledOnce();
        return ['three'];
      });

      expect(await migrate()).toBe(3);
      expect(MikroORM.init).toHaveBeenCalledTimes(2);
      expect(second.close).toHaveBeenCalledOnce();
      expect(first.migrator.up).toHaveBeenCalledWith();
      if (engine === 'postgres') {
        expect(first.execute).toHaveBeenCalledWith(
          'create schema if not exists "alpha";',
        );
        expect(MikroORM.init).toHaveBeenNthCalledWith(2, { schema: 'beta' });
      } else {
        expect(first.execute).not.toHaveBeenCalled();
        expect(MikroORM.init).toHaveBeenNthCalledWith(2, {
          dbName: 'file:beta.db',
          tenant: 'beta',
        });
      }
    },
  );

  it.each(['postgres', 'libsql'])(
    'stops and closes the current %s ORM after migration failure',
    async (engine) => {
      vi.stubEnv('DB_ENGINE', engine);
      const current = orm();
      const failure = new Error('migration failed');
      current.migrator.up.mockRejectedValue(failure);
      vi.mocked(MikroORM.init).mockResolvedValue(current as never);

      await expect(migrate()).rejects.toBe(failure);
      expect(current.close).toHaveBeenCalledOnce();
      expect(MikroORM.init).toHaveBeenCalledOnce();
    },
  );

  it.each(['postgres', 'libsql'])(
    'reverts up to the requested steps per %s tenant and stops on empty results',
    async (engine) => {
      vi.stubEnv('DB_ENGINE', engine);
      const first = orm();
      const second = orm();
      first.migrator.down
        .mockResolvedValueOnce(['one'])
        .mockResolvedValueOnce([]);
      second.migrator.down.mockResolvedValue(['two']);
      vi.mocked(MikroORM.init)
        .mockResolvedValueOnce(first as never)
        .mockResolvedValueOnce(second as never);

      expect(await revert(3)).toBe(4);
      expect(first.migrator.down).toHaveBeenCalledTimes(2);
      expect(second.migrator.down).toHaveBeenCalledTimes(3);
      expect(first.close).toHaveBeenCalledOnce();
      expect(second.close).toHaveBeenCalledOnce();
      expect(first.migrator.down).toHaveBeenCalledWith();
    },
  );

  it('closes the ORM and preserves rollback failure', async () => {
    const current = orm();
    const failure = new Error('rollback failed');
    current.migrator.down.mockRejectedValue(failure);
    vi.mocked(MikroORM.init).mockResolvedValue(current as never);

    await expect(revert()).rejects.toBe(failure);
    expect(current.close).toHaveBeenCalledOnce();
    expect(MikroORM.init).toHaveBeenCalledOnce();
  });
});
