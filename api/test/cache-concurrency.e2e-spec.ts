/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  CacheEntry,
  CacheEntrySchema,
  type ITransactionalEntityManagerSource,
  MikroOrmCache,
} from '@cqrs-ddd/core/persistence';
import { EntityManager, MikroORM } from '@mikro-orm/postgresql';
import { GenericContainer, Wait } from 'testcontainers';
import { expect, it } from 'vitest';

it.each([true, false])(
  'preserves newest PostgreSQL cache value (existing row: %s)',
  async (seed) => {
    const postgres = await new GenericContainer('postgres:16-alpine')
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
    let orm: MikroORM | undefined;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      const database = await MikroORM.init({
        host: postgres.getHost(),
        port: postgres.getMappedPort(5432),
        dbName: 'cache_test',
        user: 'test',
        password: 'test',
        entities: [CacheEntrySchema],
      });
      orm = database;
      await database.schema.create();
      if (seed)
        await database.em.fork().upsert(CacheEntry, {
          key: 'k',
          value: '{"version":1}',
          expiresAt: null,
        });
      let readDone!: () => void;
      const hasRead = new Promise<void>((resolve) => {
        readDone = resolve;
      });
      const makeStore = (pause: boolean) =>
        ({
          transactional: (callback: (em: EntityManager) => Promise<void>) =>
            database.em.fork().transactional(async (em) => {
              // Pause immediately before writing, after all reads have completed.
              const intercepted = new Proxy(em, {
                get(target, property) {
                  if (property === 'nativeUpdate' || property === 'upsert')
                    return async (...args: unknown[]) => {
                      if (pause) {
                        readDone();
                        await gate;
                      }
                      return Reflect.apply(target[property], target, args);
                    };
                  const member = Reflect.get(target, property);
                  return typeof member === 'function'
                    ? member.bind(target)
                    : member;
                },
              });
              return callback(intercepted);
            }),
        }) as unknown as ITransactionalEntityManagerSource;
      const options = {
        isNewer: (old: unknown, incoming: unknown) =>
          (old as { version: number }).version >
          (incoming as { version: number }).version,
      };
      const oldWrite = new MikroOrmCache(makeStore(true)).set(
        'k',
        { version: 2 },
        options,
      );
      await hasRead;
      try {
        await new MikroOrmCache(makeStore(false)).set(
          'k',
          { version: 3 },
          options,
        );
      } finally {
        release();
        await oldWrite;
      }
      const result = await database.em
        .fork()
        .findOneOrFail(CacheEntry, { key: 'k' });
      expect(JSON.parse(result.value).version).toBe(3);
    } finally {
      release();
      await orm?.close(true);
      await postgres.stop();
    }
  },
);
