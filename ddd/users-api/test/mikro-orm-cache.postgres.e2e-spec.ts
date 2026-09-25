/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { type EntityManager, MikroORM } from '@mikro-orm/postgresql';
import {
  CacheEntrySchema,
  createCacheTableSql,
  type ITransactionalEntityManagerSource,
  MikroOrmCache,
} from '@nestjs-pipeline/ddd-core/persistence';
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('MikroOrmCache against PostgreSQL', () => {
  let postgres: StartedTestContainer | undefined;
  let orm: MikroORM | undefined;
  let store: ITransactionalEntityManagerSource;

  beforeAll(async () => {
    postgres = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_DB: 'cache_test',
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/, 2),
      )
      .start();
    orm = await MikroORM.init({
      host: postgres.getHost(),
      port: postgres.getMappedPort(5432),
      dbName: 'cache_test',
      user: 'test',
      password: 'test',
      entities: [CacheEntrySchema],
    });
    // The table comes from the shipped helper, not from the schema generator.
    await orm.em.getConnection().execute(createCacheTableSql());
    const database = orm;
    store = {
      get em() {
        return database.em.fork();
      },
      transactional: <T>(work: (em: EntityManager) => Promise<T>) =>
        database.em.fork().transactional(work),
    };
  });

  afterAll(async () => {
    await orm?.close(true);
    await postgres?.stop();
  });

  const sql = <T>(query: string) =>
    (orm as MikroORM).em.getConnection().execute(query) as Promise<T[]>;

  const cache = <T>(defaultTtlMs?: number) =>
    new MikroOrmCache<T>(store, { defaultTtlMs });

  it('creates the table and index the helper promises', async () => {
    const columns = await sql(
      "select column_name, data_type, is_nullable from information_schema.columns where table_name = 'cache' order by column_name",
    );
    expect(columns).toEqual([
      { column_name: 'expires_at', data_type: 'bigint', is_nullable: 'YES' },
      {
        column_name: 'key',
        data_type: 'character varying',
        is_nullable: 'NO',
      },
      { column_name: 'revision', data_type: 'bigint', is_nullable: 'NO' },
      { column_name: 'value', data_type: 'text', is_nullable: 'NO' },
    ]);
    const indexes = await sql(
      "select indexname from pg_indexes where tablename = 'cache' and indexname = 'cache_expires_at_idx'",
    );
    expect(indexes).toHaveLength(1);
  });

  it('misses an absent key, then round-trips a value with an epoch-millisecond expiry', async () => {
    const values = cache<{ id: string; tags: string[] }>(60_000);

    expect(await values.get('rt:1')).toBeUndefined();
    await values.set('rt:1', { id: '1', tags: ['a', 'ü'] });

    expect(await values.get('rt:1')).toEqual({ id: '1', tags: ['a', 'ü'] });
    const [row] = (await sql(
      "select expires_at from cache where key = 'rt:1'",
    )) as {
      expires_at: string;
    }[];
    expect(Number(row.expires_at)).toBeGreaterThan(2 ** 31);
  });

  it('reports an elapsed TTL as expired and keeps the revision', async () => {
    const values = cache<{ id: string }>();
    await values.set('ttl:1', { id: '1' }, { ttl: 1 });
    const { revision } = await values.readState('ttl:1');
    await new Promise((resolve) => setTimeout(resolve, 20));

    const state = await values.readState('ttl:1');
    expect(state.status).toBe('expired');
    expect(state.revision).toBe(revision);
    expect(await values.get('ttl:1')).toBeUndefined();
  });

  it('keeps the newer value when isNewer says so', async () => {
    const values = cache<{ version: number }>();
    const isNewer = (cached: unknown, incoming: unknown) =>
      (cached as { version: number }).version >
      (incoming as { version: number }).version;

    await values.set('cas:1', { version: 2 }, { isNewer });
    await values.set('cas:1', { version: 1 }, { isNewer });

    expect(await values.get('cas:1')).toEqual({ version: 2 });
  });

  it('deletes by advancing the revision, and an absent key gets revision 1', async () => {
    const values = cache<{ id: string }>();
    await values.set('del:1', { id: '1' });
    const before = BigInt((await values.readState('del:1')).revision);
    await values.delete('del:1');

    expect(await values.get('del:1')).toBeUndefined();
    expect(BigInt((await values.readState('del:1')).revision)).toBe(
      before + 1n,
    );
    await expect(values.invalidate('del:absent')).resolves.toBe('1');
  });

  it('rejects a fill whose observed revision was invalidated in between', async () => {
    const values = cache<{ id: string }>();
    const observed = await values.readState('fence:1');
    expect(observed).toEqual({ status: 'miss', revision: '0' });

    await values.invalidate('fence:1');

    await expect(
      values.tryFill('fence:1', observed.revision, { id: 'stale' }),
    ).resolves.toBe(false);
    const fresh = await values.readState('fence:1');
    await expect(
      values.tryFill('fence:1', fresh.revision, { id: 'fresh' }),
    ).resolves.toBe(true);
    expect(await values.get('fence:1')).toEqual({ id: 'fresh' });
  });

  it('lets exactly one of two competing fills of the same revision commit', async () => {
    const values = cache<{ writer: string }>();
    await values.invalidate('race:1');
    const { revision } = await values.readState('race:1');

    const results = await Promise.all([
      values.tryFill('race:1', revision, { writer: 'a' }),
      values.tryFill('race:1', revision, { writer: 'b' }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = results[0] ? 'a' : 'b';
    expect(await values.get('race:1')).toEqual({ writer: winner });
  });
});
