/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { dirname } from 'node:path';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { ConcurrencyConflictError } from '@nestjs-pipeline/ddd-core/domain';
import { MemoryCache } from '@nestjs-pipeline/ddd-core/persistence';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Auth,
  type AuthSnapshot,
} from '../src/auths/domain/models/auth.entity';
import { AuthSessionsRepository } from '../src/auths/persistence/auth-sessions.repository';
import { CreateAuthCommandRepository } from '../src/auths/persistence/create-auth.command-repository';
import { UpdateAuthCommandRepository } from '../src/auths/persistence/update-auth.command-repository';
import { type MigratedDb, migratedDb } from './support/permission-rules-db';

const ALICE = '019de10c-b680-7000-8000-000000000006';
const DAY = 86_400_000;

function inTenant<T>(run: () => Promise<T>): Promise<T> {
  return pipelineStore.run(
    { tenantId: 'tenant' } as unknown as IPipelineContext,
    run,
  );
}

describe('Auth session persistence', () => {
  let db: MigratedDb;
  let store: { readonly em: ReturnType<MigratedDb['em']> };
  let cache: MemoryCache<AuthSnapshot>;

  beforeEach(async () => {
    db = await migratedDb();
    store = {
      get em() {
        return db.em();
      },
    };
    cache = new MemoryCache<AuthSnapshot>({ defaultTtlMs: 60_000 });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    await db.close();
  });

  async function start(hash: string, expiresAt = Date.now() + DAY) {
    const auth = Auth.start(ALICE, hash, expiresAt);
    await inTenant(() =>
      new CreateAuthCommandRepository(cache, store as never).save(auth),
    );
    return auth;
  }

  const sessions = () => new AuthSessionsRepository(store as never);
  const updates = () => new UpdateAuthCommandRepository(cache, store as never);

  it('finds a session by its current or previous hash and saves a rotation version-conditioned', async () => {
    const auth = await start('hash-a');
    const loaded = (await sessions().findByTokenHash('hash-a')) as Auth;
    loaded.refresh('hash-a', 'hash-b', Date.now(), 30_000);
    await inTenant(() => updates().save(loaded));

    expect((await sessions().findByTokenHash('hash-b'))?.id).toBe(auth.id);
    expect((await sessions().findByTokenHash('hash-a'))?.id).toBe(auth.id);
    expect(await sessions().findByTokenHash('hash-z')).toBeNull();

    const stale = Auth.fromJSON({ ...auth.toJSON(), version: 1 });
    stale.revoke(Date.now());
    await expect(inTenant(() => updates().save(stale))).rejects.toBeInstanceOf(
      ConcurrencyConflictError,
    );
  });

  it('records a consumed hash once and resolves its session', async () => {
    const auth = await start('hash-a');

    await sessions().recordConsumed('hash-old', auth.id, 1);
    await sessions().recordConsumed('hash-old', auth.id, 2);

    expect((await sessions().findByConsumedTokenHash('hash-old'))?.id).toBe(
      auth.id,
    );
    expect(
      await db.sql(
        'select consumed_at from auth_consumed_refresh_tokens where token_hash = ?',
        ['hash-old'],
      ),
    ).toEqual([{ consumed_at: 1 }]);
  });

  it('deletes sessions and their history with the user', async () => {
    const auth = await start('hash-a');
    await sessions().recordConsumed('hash-old', auth.id, 1);

    await db.sql('delete from users where id = ?', [ALICE]);

    expect(await db.sql('select id from auth')).toEqual([]);
    expect(await db.sql('select * from auth_consumed_refresh_tokens')).toEqual(
      [],
    );
  });

  it('purges expired and long-revoked sessions with their history and keeps live ones', async () => {
    const live = await start('hash-live');
    const expired = await start('hash-expired', Date.now() - 1);
    const revokedLongAgo = await start('hash-revoked-old');
    const revokedRecently = await start('hash-revoked-new');
    await sessions().recordConsumed('hash-expired-old', expired.id, 1);
    await db.sql('update auth set revoked_at = ? where id = ?', [
      Date.now() - 15 * DAY,
      revokedLongAgo.id,
    ]);
    await db.sql('update auth set revoked_at = ? where id = ?', [
      Date.now() - DAY,
      revokedRecently.id,
    ]);

    vi.stubEnv('DB_ENGINE', 'libsql');
    vi.stubEnv('SQLITE_TENANTS', '');
    vi.stubEnv('DB_DEFAULT_SCHEMA', 'tenant');
    vi.stubEnv('REFRESH_TOKEN_TTL_SECONDS', String(14 * 86_400));
    vi.stubEnv(
      'SQLITE_DATABASE_TEMPLATE',
      `file:${dirname(db.url.slice('file:'.length))}/{tenant}.db`,
    );
    const { purgeSessions } = await import('../src/persistence/purge-sessions');

    expect(await purgeSessions()).toEqual(new Map([['tenant', 2]]));
    expect(
      ((await db.sql('select id from auth order by id')) as { id: string }[])
        .map((row) => row.id)
        .sort(),
    ).toEqual([live.id, revokedRecently.id].sort());
    expect(await db.sql('select * from auth_consumed_refresh_tokens')).toEqual(
      [],
    );
  });
});
