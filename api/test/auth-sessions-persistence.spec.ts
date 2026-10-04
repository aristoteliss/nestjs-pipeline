/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { dirname } from 'node:path';
import { ConcurrencyConflictError } from '@cqrs-ddd/core/domain';
import { MemoryCache } from '@cqrs-ddd/core/persistence';
import { type IPipelineContext, pipelineStore } from '@cqrs-ddd/pipeline';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GetAuthByConsumedTokenHashQuery } from '../src/auths/application/cqrs/queries/get-auth-by-consumed-token-hash.query.js';
import { GetAuthByTokenHashQuery } from '../src/auths/application/cqrs/queries/get-auth-by-token-hash.query.js';
import { RefreshTokenReuseError } from '../src/auths/domain/errors/refresh-token.errors.js';
import {
  Auth,
  type AuthSnapshot,
} from '../src/auths/domain/models/auth.entity.js';
import { NodeRefreshTokens } from '../src/auths/infrastructure/node-refresh-tokens.js';
import { CreateAuthCommandRepository } from '../src/auths/persistence/create-auth.command-repository.js';
import { GetAuthByConsumedTokenHashQueryRepository } from '../src/auths/persistence/get-auth-by-consumed-token-hash.query-repository.js';
import { GetAuthByTokenHashQueryRepository } from '../src/auths/persistence/get-auth-by-token-hash.query-repository.js';
import { UpdateAuthCommandRepository } from '../src/auths/persistence/update-auth.command-repository.js';
import { PrincipalLoginService } from '../src/auths/services/principal-login.service.js';
import { type MigratedDb, migratedDb } from './support/permission-rules-db.js';

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
    const auth = Auth.create(ALICE, hash, expiresAt);
    await inTenant(() =>
      new CreateAuthCommandRepository(cache, store as never).save(auth),
    );
    return auth;
  }

  const byTokenHash = () =>
    new GetAuthByTokenHashQueryRepository(cache, store as never);
  const byConsumedTokenHash = () =>
    new GetAuthByConsumedTokenHashQueryRepository(cache, store as never);
  const updates = () => new UpdateAuthCommandRepository(cache, store as never);

  it('finds a session by its current or previous hash and saves a rotation version-conditioned', async () => {
    const auth = await start('hash-a');
    const loaded = (await byTokenHash().find(
      new GetAuthByTokenHashQuery({ tokenHash: 'hash-a' }),
    )) as Auth;
    loaded.refresh('hash-a', 'hash-b', Date.now(), 30_000);
    await inTenant(() => updates().save(loaded));

    expect(
      (
        await byTokenHash().find(
          new GetAuthByTokenHashQuery({ tokenHash: 'hash-b' }),
        )
      )?.id,
    ).toBe(auth.id);
    expect(
      (
        await byTokenHash().find(
          new GetAuthByTokenHashQuery({ tokenHash: 'hash-a' }),
        )
      )?.id,
    ).toBe(auth.id);
    expect(
      await byTokenHash().find(
        new GetAuthByTokenHashQuery({ tokenHash: 'hash-z' }),
      ),
    ).toBeNull();

    const stale = Auth.fromJSON({ ...auth.toJSON(), version: 1 });
    stale.revoke(Date.now());
    await expect(inTenant(() => updates().save(stale))).rejects.toBeInstanceOf(
      ConcurrencyConflictError,
    );
  });

  it('persists previous-token reuse revocation through the real repository', async () => {
    const tokens = new NodeRefreshTokens();
    const auth = await start(tokens.hash('token-a'));
    const loaded = (await byTokenHash().find(
      new GetAuthByTokenHashQuery({ tokenHash: tokens.hash('token-a') }),
    )) as Auth;
    loaded.refresh(
      tokens.hash('token-a'),
      tokens.hash('token-b'),
      Date.now() - 31_000,
      30_000,
    );
    await inTenant(() => updates().save(loaded));
    const service = new PrincipalLoginService(
      { find: vi.fn() } as never,
      { verify: vi.fn() } as never,
      { issue: vi.fn() } as never,
      {
        refreshTokenTtlSeconds: 3600,
        refreshReuseGraceSeconds: 30,
        embedPermissions: false,
      },
      { find: vi.fn() } as never,
      byTokenHash(),
      byConsumedTokenHash(),
      updates(),
      tokens,
      { save: vi.fn(), clear: vi.fn() },
    );
    await expect(
      inTenant(() => service.refresh('token-a', '127.0.0.1')),
    ).rejects.toBeInstanceOf(RefreshTokenReuseError);
    const persisted = await updates().findById(auth.id);
    expect(persisted?.revokedAt).not.toBeNull();
  });

  it('revokes historical-token reuse after a competing database rotation', async () => {
    const tokens = new NodeRefreshTokens();
    const auth = await start(tokens.hash('token-a'));
    for (const [from, to] of [
      ['token-a', 'token-b'],
      ['token-b', 'token-c'],
    ]) {
      const loaded = (await byTokenHash().find(
        new GetAuthByTokenHashQuery({ tokenHash: tokens.hash(from) }),
      )) as Auth;
      loaded.refresh(tokens.hash(from), tokens.hash(to), Date.now(), 30_000);
      await inTenant(() => updates().save(loaded));
    }
    const repository = updates();
    const save = repository.save.bind(repository);
    vi.spyOn(repository, 'save').mockImplementationOnce(async (stale) => {
      const competing = updates();
      const winner = (await competing.findById(auth.id)) as Auth;
      winner.refresh(
        tokens.hash('token-c'),
        tokens.hash('token-d'),
        Date.now(),
        30_000,
      );
      await competing.save(winner);
      return save(stale);
    });
    const service = new PrincipalLoginService(
      { find: vi.fn() } as never,
      { verify: vi.fn() } as never,
      { issue: vi.fn() } as never,
      {
        refreshTokenTtlSeconds: 3600,
        refreshReuseGraceSeconds: 30,
        embedPermissions: false,
      },
      { find: vi.fn() } as never,
      byTokenHash(),
      byConsumedTokenHash(),
      repository,
      tokens,
      { save: vi.fn(), clear: vi.fn() },
    );
    await expect(
      inTenant(() => service.refresh('token-a', '127.0.0.1')),
    ).rejects.toBeInstanceOf(RefreshTokenReuseError);
    const persisted = await byTokenHash().find(
      new GetAuthByTokenHashQuery({ tokenHash: tokens.hash('token-d') }),
    );
    expect(persisted?.revokedAt).not.toBeNull();
    expect(persisted?.id).toBe(auth.id);
  });

  it('records a consumed hash once and resolves its session', async () => {
    const auth = await start('hash-old');
    const first = Auth.fromJSON(auth.toJSON());
    const second = Auth.fromJSON(auth.toJSON());
    first.refresh('hash-old', 'hash-a', 1, 30_000);
    second.refresh('hash-old', 'hash-b', 2, 30_000);

    await inTenant(() => updates().save(first));
    await expect(inTenant(() => updates().save(second))).rejects.toBeInstanceOf(
      ConcurrencyConflictError,
    );

    expect(
      (
        await byConsumedTokenHash().find(
          new GetAuthByConsumedTokenHashQuery({ tokenHash: 'hash-old' }),
        )
      )?.id,
    ).toBe(auth.id);
    expect(
      await db.sql(
        'select consumed_at from auth_consumed_refresh_tokens where token_hash = ?',
        ['hash-old'],
      ),
    ).toEqual([{ consumed_at: 1 }]);
  });

  it('deletes sessions and their history with the user', async () => {
    const auth = await start('hash-old');
    auth.refresh('hash-old', 'hash-a', Date.now(), 30_000);
    await inTenant(() => updates().save(auth));

    await db.sql('delete from users where id = ?', [ALICE]);

    expect(await db.sql('select id from auth')).toEqual([]);
    expect(await db.sql('select * from auth_consumed_refresh_tokens')).toEqual(
      [],
    );
  });

  it('purges expired and long-revoked sessions with their history and keeps live ones', async () => {
    const live = await start('hash-live');
    const expired = await start('hash-expired-old', Date.now() + 1_000);
    const revokedLongAgo = await start('hash-revoked-old');
    const revokedRecently = await start('hash-revoked-new');
    expired.refresh('hash-expired-old', 'hash-expired', Date.now(), 30_000);
    await inTenant(() => updates().save(expired));
    await db.sql('update auth set expires_at = ? where id = ?', [
      Date.now() - 1,
      expired.id,
    ]);
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
    const { purgeSessions } = await import(
      '../src/persistence/purge-sessions.js'
    );

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
