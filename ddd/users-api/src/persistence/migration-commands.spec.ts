/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MikroORM } from '@mikro-orm/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from './migrate';
import { revert } from './revert';

vi.mock('@mikro-orm/core', () => ({ MikroORM: { init: vi.fn() } }));
vi.mock('./postgres-options', () => ({
  normalizeSchemaName: (name?: string) => name?.trim() || 'public',
  createPostgresOrmOptions: (schema: string) => ({ schema }),
}));
vi.mock('./libsql-options', () => ({
  resolveLibsqlTenants: () => ['alpha', 'beta'],
  resolveLibsqlDbUrl: (tenant: string) => `file:${tenant}.db`,
  createLibsqlOrmOptions: (dbName: string) => ({ dbName }),
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
    vi.stubEnv('SEED_TENANT', 'original');
    vi.mocked(MikroORM.init).mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each(['postgres', 'libsql'])(
    'migrates every %s tenant and restores seed context',
    async (engine) => {
      vi.stubEnv('DB_ENGINE', engine);
      const first = orm();
      const second = orm();
      vi.mocked(MikroORM.init)
        .mockResolvedValueOnce(first as never)
        .mockResolvedValueOnce(second as never);
      first.migrator.up.mockImplementation(async () => {
        expect(process.env.SEED_TENANT).toBe('alpha');
        return ['one', 'two'];
      });
      second.migrator.up.mockImplementation(async () => {
        expect(first.close).toHaveBeenCalledOnce();
        expect(process.env.SEED_TENANT).toBe('beta');
        return ['three'];
      });

      expect(await migrate()).toBe(3);
      expect(MikroORM.init).toHaveBeenCalledTimes(2);
      expect(process.env.SEED_TENANT).toBe('original');
      expect(second.close).toHaveBeenCalledOnce();
      if (engine === 'postgres') {
        expect(first.execute).toHaveBeenCalledWith(
          'create schema if not exists "alpha";',
        );
        expect(first.migrator.up).toHaveBeenCalledWith({ schema: 'alpha' });
        expect(MikroORM.init).toHaveBeenNthCalledWith(2, { schema: 'beta' });
      } else {
        expect(first.execute).not.toHaveBeenCalled();
        expect(first.migrator.up).toHaveBeenCalledWith();
        expect(MikroORM.init).toHaveBeenNthCalledWith(2, {
          dbName: 'file:beta.db',
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
      expect(process.env.SEED_TENANT).toBe('original');
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
      if (engine === 'postgres') {
        expect(first.migrator.down).toHaveBeenCalledWith({ schema: 'alpha' });
      } else {
        expect(first.migrator.down).toHaveBeenCalledWith();
      }
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
