/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { MemoryCache } from '../cache/memory.cache';
import type { ICache } from '../cache.interface';
import { PersistedWrite } from './persisted-write.decorator';

class Aggregate {
  readonly acknowledged: number[] = [];

  constructor(
    readonly id: string,
    public version: number,
  ) {}

  acknowledgePersisted(version?: number): void {
    this.acknowledged.push(version ?? this.version);
  }
}

class DuplicateNameError extends Error {}
class TranslatedError extends Error {}

const duplicateName = Object.assign(new Error('duplicate'), {
  code: '23505',
  constraint: 'aggregates_name_unique',
});

class Repository {
  failure?: unknown;

  constructor(public cache?: ICache) {}

  @PersistedWrite<Aggregate>({
    cache: { setKey: (aggregate) => `aggregate:${aggregate.id}` },
    unique: [
      {
        constraint: 'aggregates_name_unique',
        columns: 'aggregates.name',
        error: () => new DuplicateNameError(),
      },
    ],
    otherwise: (error) =>
      error instanceof Error && error.message === 'transient'
        ? new TranslatedError()
        : error,
  })
  async save(aggregate: Aggregate): Promise<{ id: string; version: number }> {
    if (this.failure) throw this.failure;
    return { id: aggregate.id, version: aggregate.version };
  }
}

function recordingCache() {
  const set = vi.fn();
  const cache: ICache = { get: vi.fn(), set, delete: vi.fn() };
  return { cache, set };
}

describe('PersistedWrite', () => {
  it('acknowledges the entry version before writing the cache', async () => {
    const aggregate = new Aggregate('a-1', 2);
    const { cache, set } = recordingCache();
    set.mockImplementation(() => {
      expect(aggregate.acknowledged).toEqual([2]);
    });

    const result = await new Repository(cache).save(aggregate);

    expect(result).toEqual({ id: 'a-1', version: 2 });
    expect(set).toHaveBeenCalledOnce();
    expect(set.mock.calls[0][0]).toBe('aggregate:a-1');
  });

  it('writes the result snapshot through a versioned cache', async () => {
    const cache = new MemoryCache<unknown>();

    await new Repository(cache).save(new Aggregate('a-1', 3));

    expect(await cache.get('aggregate:a-1')).toEqual({
      id: 'a-1',
      version: 3,
    });
  });

  it('translates a unique violation without acknowledging or touching the cache', async () => {
    const aggregate = new Aggregate('a-1', 2);
    const { cache, set } = recordingCache();
    const repository = new Repository(cache);
    repository.failure = duplicateName;

    await expect(repository.save(aggregate)).rejects.toBeInstanceOf(
      DuplicateNameError,
    );
    expect(aggregate.acknowledged).toEqual([]);
    expect(set).not.toHaveBeenCalled();
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('passes unmatched errors through the residual translator', async () => {
    const repository = new Repository(recordingCache().cache);
    repository.failure = new Error('transient');

    await expect(
      repository.save(new Aggregate('a-1', 1)),
    ).rejects.toBeInstanceOf(TranslatedError);

    const unrelated = new Error('other');
    repository.failure = unrelated;
    await expect(repository.save(new Aggregate('a-1', 1))).rejects.toBe(
      unrelated,
    );
  });

  it('acknowledges without cache maintenance when no cache is configured', async () => {
    class Uncached {
      cache?: ICache;

      @PersistedWrite<Aggregate>()
      async save(aggregate: Aggregate): Promise<string> {
        return aggregate.id;
      }
    }
    const aggregate = new Aggregate('a-1', 4);

    expect(await new Uncached().save(aggregate)).toBe('a-1');
    expect(aggregate.acknowledged).toEqual([4]);
  });

  it('rejects an invalid cache declaration at decoration time', () => {
    expect(() => PersistedWrite<Aggregate>({ cache: {} })).toThrow(
      /requires at least one of setKey, deleteKeys, or invalidateKeys/,
    );
  });
});
