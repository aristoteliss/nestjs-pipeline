/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { MemoryCache } from '../cache/memory.cache';
import type { ICache } from '../cache.interface';
import { Cache, DEFAULT_BARRIER_TTL_MS } from './Cache';

interface MockEntity {
  id: string;
}

class TestCommandRepo {
  constructor(public cache?: ICache) {}

  @Cache<MockEntity, { id: string }>({
    setKey: (entity) => `mock:${entity.id}`,
    deleteKeys: (entity) => [`mock:${entity.id}`],
  })
  async save(entity: MockEntity): Promise<{ id: string } | null> {
    if (entity.id === 'delete-me') {
      return null;
    }
    return { id: entity.id };
  }
}

class BooleanCommandRepo {
  constructor(public cache?: ICache) {}

  @Cache<MockEntity, boolean>((entity) => `mock:${entity.id}`)
  async save(_entity: MockEntity): Promise<boolean | null> {
    return false;
  }
}

class VoidCommandRepo {
  constructor(public cache?: ICache<void>) {}

  @Cache<MockEntity, void>({
    deleteKeys: (entity) => [`mock:${entity.id}`],
  })
  async save(_entity: MockEntity): Promise<void> {}
}

class SecondaryInvalidationRepo {
  constructor(public cache?: ICache) {}

  @Cache<MockEntity, { id: string }>(
    (entity) => `user:${entity.id}`,
    null,
    (entity) => [`email:${entity.id}`],
  )
  async save(entity: MockEntity): Promise<{ id: string }> {
    return { id: entity.id };
  }
}

describe('@Cache decorator on CommandRepository.save', () => {
  it('throws an error if instantiated without any key derivation function', () => {
    expect(() => {
      Cache(null, null, null);
    }).toThrow(
      '@Cache decorator requires at least one of setKey, deleteKeys, or invalidateKeys to be specified.',
    );
  });

  it('passes through when repository has no cache attached', async () => {
    const repo = new TestCommandRepo(undefined);
    const entity: MockEntity = { id: 'u1' };

    const result = await repo.save(entity);
    expect(result).toEqual({ id: 'u1' });
  });

  it('reports a repository without a cache property once and still saves', async () => {
    class MiswiredCommandRepo {
      constructor(readonly cacheClient: ICache) {}

      @Cache<MockEntity, { id: string }>((entity) => `mock:${entity.id}`)
      async save(entity: MockEntity): Promise<{ id: string }> {
        return { id: entity.id };
      }
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const repo = new MiswiredCommandRepo(new MemoryCache());

    try {
      await expect(repo.save({ id: 'u1' })).resolves.toEqual({ id: 'u1' });
      await repo.save({ id: 'u2' });

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/^\[CacheDecorators\] /);
      expect(warn.mock.calls[0][0]).toContain(
        'MiswiredCommandRepo uses @Cache',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('does not report a repository whose cache is deliberately unset', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      await new TestCommandRepo(undefined).save({ id: 'u1' });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('routes maintenance warnings to the configured logger', async () => {
    const logger = { warn: vi.fn() };
    class LoggedRepo {
      constructor(public cache?: ICache) {}

      @Cache<MockEntity, { id: string }>({
        setKey: () => {
          throw new Error('bad key');
        },
        logger,
      })
      async save(entity: MockEntity): Promise<{ id: string }> {
        return { id: entity.id };
      }
    }
    const consoleWarn = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    try {
      await expect(
        new LoggedRepo(new MemoryCache()).save({ id: 'u1' }),
      ).resolves.toEqual({ id: 'u1' });

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed resolving setKey during cache maintenance: bad key',
      );
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
    }
  });

  it('resolves a durable write when the configured logger throws', async () => {
    const logger = {
      warn: vi.fn(() => {
        throw new Error('logger down');
      }),
    };
    class ThrowingLoggerRepo {
      constructor(public cache?: ICache) {}

      @Cache<MockEntity, { id: string }>({
        setKey: () => {
          throw new Error('bad key');
        },
        logger,
      })
      async save(entity: MockEntity): Promise<{ id: string }> {
        return { id: entity.id };
      }
    }

    await expect(
      new ThrowingLoggerRepo(new MemoryCache()).save({ id: 'u1' }),
    ).resolves.toEqual({ id: 'u1' });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('resolves a durable write when a key function returns a value that is not a list', async () => {
    // A JavaScript caller is not held to the `string[]` return type.
    const logger = { warn: vi.fn() };
    class NonListKeysRepo {
      constructor(public cache?: ICache) {}

      @Cache<MockEntity, { id: string }>({
        invalidateKeys: () => 42 as unknown as string[],
        logger,
      })
      async save(entity: MockEntity): Promise<{ id: string }> {
        return { id: entity.id };
      }
    }

    await expect(
      new NonListKeysRepo(new MemoryCache()).save({ id: 'u1' }),
    ).resolves.toEqual({ id: 'u1' });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toMatch(
      /^Unexpected error during cache maintenance: .*not iterable/,
    );
  });

  it('writes through without a comparison when isNewer is null', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const unversioned: ICache = {
      get: vi.fn(),
      set,
      delete: vi.fn(),
    };
    class UncomparedRepo {
      constructor(public cache?: ICache) {}

      @Cache<MockEntity, { id: string }>({
        setKey: (entity) => `mock:${entity.id}`,
        isNewer: null,
      })
      async save(entity: MockEntity): Promise<{ id: string }> {
        return { id: entity.id };
      }
    }

    await new UncomparedRepo(unversioned).save({ id: 'u1' });

    expect(set).toHaveBeenCalledWith(
      'mock:u1',
      { id: 'u1' },
      { ttl: undefined, isNewer: undefined },
    );
  });

  it('writes saved entity result to cache using entity id', async () => {
    const mockCache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };

    const repo = new TestCommandRepo(mockCache);
    const entity: MockEntity = { id: 'u1' };

    const result = await repo.save(entity);

    expect(result).toEqual({ id: 'u1' });
    expect(mockCache.set).toHaveBeenCalledWith(
      'mock:u1',
      { id: 'u1' },
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
  });

  it('evicts cache key when save returns null (e.g. deletion)', async () => {
    const mockCache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };

    const repo = new TestCommandRepo(mockCache);
    const entity: MockEntity = {
      id: 'delete-me',
    };

    const result = await repo.save(entity);

    expect(result).toBeNull();
    expect(mockCache.set).toHaveBeenCalledWith(
      'mock:delete-me',
      expect.objectContaining({
        __cacheBarrier: true,
        reason: 'deleted',
      }),
      { ttl: DEFAULT_BARRIER_TTL_MS },
    );
    expect(mockCache.delete).not.toHaveBeenCalled();
  });

  it('caches and returns a valid falsy result instead of treating it as deletion', async () => {
    const mockCache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new BooleanCommandRepo(mockCache);
    const entity: MockEntity = { id: 'u1' };

    const result = await repo.save(entity);

    expect(result).toBe(false);
    expect(mockCache.set).toHaveBeenCalledWith(
      'mock:u1',
      false,
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
    expect(mockCache.delete).not.toHaveBeenCalled();
  });

  it('evicts instead of caching undefined for a void save', async () => {
    const mockCache: ICache<void> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new VoidCommandRepo(mockCache);
    const entity: MockEntity = { id: 'u1' };

    const result = await repo.save(entity);

    expect(result).toBeUndefined();
    expect(mockCache.set).toHaveBeenCalledWith(
      'mock:u1',
      expect.objectContaining({
        __cacheBarrier: true,
        reason: 'deleted',
      }),
      { ttl: DEFAULT_BARRIER_TTL_MS },
    );
    expect(mockCache.delete).not.toHaveBeenCalled();
  });

  it('evicts secondary keys after a successful save before caching the result', async () => {
    const cache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new SecondaryInvalidationRepo(cache);
    const entity: MockEntity = { id: 'u1' };

    await repo.save(entity);

    expect(cache.set).toHaveBeenNthCalledWith(
      1,
      'email:u1',
      expect.objectContaining({
        __cacheBarrier: true,
        reason: 'invalidated',
      }),
      { ttl: DEFAULT_BARRIER_TTL_MS },
    );
    expect(cache.set).toHaveBeenNthCalledWith(
      2,
      'user:u1',
      { id: 'u1' },
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('does not fail save if deleteKeys or invalidateKeys callbacks throw', async () => {
    class FailingCallbacksRepo {
      constructor(public cache?: ICache) {}

      @Cache<MockEntity, { id: string } | null>({
        setKey: () => 'mock:key',
        invalidateKeys: () => {
          throw new Error('Explosion in invalidateKeys');
        },
        deleteKeys: () => {
          throw new Error('Explosion in deleteKeys');
        },
      })
      async save(entity: MockEntity): Promise<{ id: string } | null> {
        if (entity.id === 'del') {
          return null;
        }
        return { id: entity.id };
      }
    }

    const cache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new FailingCallbacksRepo(cache);

    // Save success case when invalidateKeys throws
    const saveResult = await repo.save({ id: 'ok' });
    expect(saveResult).toEqual({ id: 'ok' });

    // Save deletion case when deleteKeys throws
    const delResult = await repo.save({ id: 'del' });
    expect(delResult).toBeNull();
  });

  it('does not fail save if setKey callback throws', async () => {
    class FailingSetKeyRepo {
      constructor(public cache?: ICache) {}

      @Cache<MockEntity, { id: string }>({
        setKey: () => {
          throw new Error('Explosion in setKey');
        },
      })
      async save(entity: MockEntity): Promise<{ id: string }> {
        return { id: entity.id };
      }
    }

    const cache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new FailingSetKeyRepo(cache);

    const result = await repo.save({ id: 'ok' });
    expect(result).toEqual({ id: 'ok' });
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('passes configured ttl and custom isNewer options to cache.set', async () => {
    const customIsNewer = vi.fn().mockReturnValue(true);
    class OptionsRepo {
      constructor(public cache?: ICache) {}

      @Cache<MockEntity, { id: string }>({
        setKey: (entity) => `opt:${entity.id}`,
        ttl: 5000,
        isNewer: customIsNewer,
      })
      async save(entity: MockEntity): Promise<{ id: string }> {
        return { id: entity.id };
      }
    }

    const mockCache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new OptionsRepo(mockCache);
    await repo.save({ id: 'item1' });

    expect(mockCache.set).toHaveBeenCalledWith(
      'opt:item1',
      { id: 'item1' },
      {
        ttl: 5000,
        isNewer: customIsNewer,
      },
    );
  });

  it('converts live entity to snapshot via toJSON() before caching', async () => {
    class LiveUser {
      constructor(
        public readonly id: string,
        public readonly name: string,
      ) {}

      toJSON() {
        return { id: this.id, name: this.name, isSnapshot: true };
      }
    }

    class AggregateRepo {
      constructor(public cache?: ICache) {}

      @Cache<LiveUser, LiveUser>((user) => `user:${user.id}`)
      async save(user: LiveUser): Promise<LiveUser> {
        return user;
      }
    }

    const mockCache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new AggregateRepo(mockCache);
    const liveUser = new LiveUser('u123', 'Alice');
    const result = await repo.save(liveUser);

    expect(result).toBe(liveUser);
    expect(mockCache.set).toHaveBeenCalledWith(
      'user:u123',
      { id: 'u123', name: 'Alice', isSnapshot: true },
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
  });

  it('prevents older write-through from overwriting newer cached version (CAS protection)', async () => {
    // Simulated stateful cache implementing isNewer CAS logic
    const store = new Map<string, unknown>();
    const casCache: ICache = {
      get: vi.fn(async (key: string) => store.get(key)),
      set: vi.fn(async (key: string, value: unknown, options) => {
        const existing = store.get(key);
        if (existing && options?.isNewer?.(existing, value)) {
          return; // Skip stale write
        }
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    };

    interface VersionedEntity {
      id: string;
      version: number;
    }

    class VersionedEntityRepo {
      constructor(public cache?: ICache) {}

      @Cache<VersionedEntity, { id: string; version: number }>(
        (e) => `entity:${e.id}`,
      )
      async save(
        entity: VersionedEntity,
      ): Promise<{ id: string; version: number }> {
        return { id: entity.id, version: entity.version };
      }
    }

    const repo = new VersionedEntityRepo(casCache);

    // Initial write at version 1
    await repo.save({ id: 'e1', version: 1 });
    expect(store.get('entity:e1')).toEqual({ id: 'e1', version: 1 });

    // Command B commits and caches version 3
    await repo.save({ id: 'e1', version: 3 });
    expect(store.get('entity:e1')).toEqual({ id: 'e1', version: 3 });

    // Command A delayed write-through completes with version 2
    await repo.save({ id: 'e1', version: 2 });

    // The cache MUST NOT have been overwritten by stale version 2; it stays version 3!
    expect(store.get('entity:e1')).toEqual({ id: 'e1', version: 3 });
  });
});

/**
 * Writer-side anti-resurrection, exercised against a real cache implementation.
 *
 * `@FromCache` guards readers, but those guards never engage against a plain
 * snapshot. A write-through that started before a concurrent delete must not be
 * allowed to land afterwards — every later read would then see an ordinary
 * cache hit for a row that no longer exists in the database.
 *
 * A versioned adapter enforces that by revision: the write-through observes the
 * key's revision before persisting and commits only while it still matches.
 * Unversioned adapters fall back to the mutation-barrier token protocol.
 */
describe('@Cache anti-resurrection against a concurrent write-through', () => {
  interface VersionedSnapshot {
    id: string;
    version: number;
  }

  class UpdateRepo {
    persistGate?: Promise<void>;

    constructor(public cache?: ICache<VersionedSnapshot>) {}

    @Cache<VersionedSnapshot, VersionedSnapshot>({
      setKey: (entity) => `user:${entity.id}`,
    })
    async save(entity: VersionedSnapshot): Promise<VersionedSnapshot | null> {
      await this.persistGate;
      return entity;
    }
  }

  class DeleteRepo {
    constructor(public cache?: ICache<VersionedSnapshot>) {}

    @Cache<VersionedSnapshot, VersionedSnapshot>({
      setKey: null,
      deleteKeys: (entity) => [`user:${entity.id}`],
    })
    async save(_entity: VersionedSnapshot): Promise<VersionedSnapshot | null> {
      return null;
    }
  }

  it('does not let a late write-through resurrect a deleted aggregate', async () => {
    const cache = new MemoryCache<VersionedSnapshot>();
    const updates = new UpdateRepo(cache);
    const deletes = new DeleteRepo(cache);
    const user = { id: 'u-1', version: 5 };

    await updates.save(user);

    // An update starts — observing the key as it is now — and is still
    // persisting when the delete lands.
    let release!: () => void;
    updates.persistGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inFlight = updates.save({ id: 'u-1', version: 6 });

    await deletes.save(user);
    release();
    await inFlight;

    // The delete advanced the revision, so the late fill was rejected.
    expect(await cache.get('user:u-1')).toBeUndefined();
  });

  it('evicts the key on every deletion and advances its revision', async () => {
    const cache = new MemoryCache<VersionedSnapshot>();
    const deletes = new DeleteRepo(cache);
    const user = { id: 'u-1', version: 1 };

    await deletes.save(user);
    const first = await cache.readState('user:u-1');
    await deletes.save(user);
    const second = await cache.readState('user:u-1');

    expect(first.status).toBe('miss');
    expect(second.status).toBe('miss');
    expect(BigInt(second.revision)).toBeGreaterThan(BigInt(first.revision));
  });

  it('bounds the barrier lifetime on unversioned adapters', async () => {
    // `ttl: 0` was read as "never expires", so every deleted aggregate left a
    // permanent entry behind on adapters that have no revision to advance.
    const cache: ICache<VersionedSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    await new DeleteRepo(cache).save({ id: 'u-1', version: 1 });

    expect(cache.set).toHaveBeenCalledWith(
      'user:u-1',
      expect.objectContaining({ __cacheBarrier: true }),
      { ttl: DEFAULT_BARRIER_TTL_MS },
    );
    expect(DEFAULT_BARRIER_TTL_MS).toBeGreaterThan(0);
  });
});

describe('@Cache write-through without an observed revision', () => {
  class SlowRepo {
    constructor(
      public cache: MemoryCache<{ id: string; v: number }>,
      private readonly duringWrite: () => Promise<void>,
    ) {}

    @Cache<MockEntity, { id: string; v: number }>({
      setKey: (entity) => `mock:${entity.id}`,
    })
    async save(entity: MockEntity): Promise<{ id: string; v: number }> {
      await this.duringWrite();
      return { id: entity.id, v: 1 };
    }
  }

  it('never installs the snapshot unfenced when the initial readState fails', async () => {
    const cache = new MemoryCache<{ id: string; v: number }>();
    await cache.set('mock:a', { id: 'a', v: 0 });
    vi.spyOn(cache, 'readState').mockRejectedValueOnce(new Error('cache down'));
    const repo = new SlowRepo(cache, () => cache.invalidate('mock:a').then());

    await repo.save({ id: 'a' });

    expect(await cache.get('mock:a')).toBeUndefined();
  });

  it('drops the pre-write value when no revision could be observed', async () => {
    const cache = new MemoryCache<{ id: string; v: number }>();
    await cache.set('mock:a', { id: 'a', v: 0 });
    vi.spyOn(cache, 'readState').mockRejectedValueOnce(new Error('cache down'));
    const repo = new SlowRepo(cache, async () => undefined);

    await repo.save({ id: 'a' });

    expect(await cache.get('mock:a')).toBeUndefined();
  });

  it('rejects invalid decorator argument with Error', () => {
    expect(() => Cache(123 as any)).toThrow(
      '@Cache decorator requires an explicit key derivation function or options object.',
    );
  });

  it('handles deleteKeys returning undefined or throwing non-Error', async () => {
    class UndefinedDeleteRepo {
      constructor(public cache?: ICache) {}
      @Cache<MockEntity, null>({
        deleteKeys: () => undefined as any,
      })
      async save(_entity: MockEntity): Promise<null> {
        return null;
      }
    }
    const repo1 = new UndefinedDeleteRepo(new MemoryCache());
    await expect(repo1.save({ id: 'a' })).resolves.toBeNull();

    class ThrowingStringDeleteRepo {
      constructor(public cache?: ICache) {}
      @Cache<MockEntity, null>({
        deleteKeys: () => {
          throw 'non-error delete failure';
        },
      })
      async save(_entity: MockEntity): Promise<null> {
        return null;
      }
    }
    const repo2 = new ThrowingStringDeleteRepo(new MemoryCache());
    await expect(repo2.save({ id: 'a' })).resolves.toBeNull();
  });

  it('handles non-Error thrown during eviction and setKey derivation', async () => {
    const failingEvictCache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn().mockRejectedValue('evict string rejection'),
    };
    class EvictFailRepo {
      constructor(public cache?: ICache) {}
      @Cache<MockEntity, null>({
        deleteKeys: (e) => [`mock:${e.id}`],
      })
      async save(_entity: MockEntity): Promise<null> {
        return null;
      }
    }
    const repo1 = new EvictFailRepo(failingEvictCache);
    await expect(repo1.save({ id: 'a' })).resolves.toBeNull();

    class ThrowingStringKeyRepo {
      constructor(public cache?: ICache) {}
      @Cache<MockEntity, { id: string }>({
        setKey: () => {
          throw 'setKey string rejection';
        },
      })
      async save(e: MockEntity): Promise<{ id: string }> {
        return { id: e.id };
      }
    }
    const repo2 = new ThrowingStringKeyRepo(new MemoryCache());
    await expect(repo2.save({ id: 'a' })).resolves.toEqual({ id: 'a' });
  });

  it('skips tryFill when observed value before persistence is newer than result', async () => {
    const cache = new MemoryCache<{ id: string; version: number }>();
    await cache.set('mock:a', { id: 'a', version: 5 });

    class NewerRepo {
      constructor(public cache: MemoryCache<{ id: string; version: number }>) {}
      @Cache<MockEntity, { id: string; version: number }>({
        setKey: (e) => `mock:${e.id}`,
        isNewer: (cached: any, incoming: any) =>
          (cached?.version ?? 0) > (incoming?.version ?? 0),
      })
      async save(e: MockEntity): Promise<{ id: string; version: number }> {
        return { id: e.id, version: 1 };
      }
    }

    const repo = new NewerRepo(cache);
    const result = await repo.save({ id: 'a' });
    expect(result).toEqual({ id: 'a', version: 1 });
    expect((await cache.get('mock:a'))?.version).toBe(5);
  });

  it('catches and warns when unversioned cache.set fails', async () => {
    const unversionedFailingCache: ICache = {
      get: vi.fn(),
      set: vi.fn().mockRejectedValue(new Error('unversioned set error')),
      delete: vi.fn(),
    };
    class SetFailRepo {
      constructor(public cache?: ICache) {}
      @Cache<MockEntity, { id: string }>((e) => `mock:${e.id}`)
      async save(e: MockEntity): Promise<{ id: string }> {
        return { id: e.id };
      }
    }
    const repo = new SetFailRepo(unversionedFailingCache);
    await expect(repo.save({ id: 'a' })).resolves.toEqual({ id: 'a' });
  });
});
