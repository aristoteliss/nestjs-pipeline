/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { type ICache, runWithTenant } from '@cqrs-ddd/core/application';
import { filterCacheKey, MemoryCache } from '@cqrs-ddd/core/persistence';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';
import { describe, expect, it, vi } from 'vitest';
import { GetUserQuery } from '../cqrs/queries/get-user.query';
import { User, type UserSnapshot } from '../domain/models/user.entity';
import { GetUserQueryRepository } from './get-user.query-repository';

/** A real revision-fenced adapter holding `snapshot` under the tenant id key. */
async function cacheHolding(
  snapshot?: UserSnapshot,
): Promise<MemoryCache<UserSnapshot>> {
  const cache = new MemoryCache<UserSnapshot>({ defaultTtlMs: 60_000 });
  if (snapshot) {
    await cache.set(
      filterCacheKey(User.aggregateName, { id: snapshot.id }, 'tenant'),
      snapshot,
    );
  }
  return cache;
}

describe('GetUserQueryRepository cache policy', () => {
  it('preserves hydration metadata through global payload validation', async () => {
    const persisted = User.create('Alice', 'alice@example.test', 'engineering');
    const cache = await cacheHolding(persisted.toJSON());
    const store = { em: { findOne: vi.fn() } };
    const repository = new GetUserQueryRepository(cache, store as never);
    const query = new GetUserQuery({ userId: persisted.id }, { hydrate: true });

    await new ZodValidationBehavior().handle(
      {
        request: query,
        requestType: GetUserQuery,
      } as never,
      async () => undefined,
    );
    const result = await runWithTenant('tenant', () => repository.find(query));

    expect(query.hydrate).toBe(true);
    expect(result).toBeInstanceOf(User);
    expect(store.em.findOne).not.toHaveBeenCalled();
  });

  it('bypasses cache for a lookup that includes mutable department criteria', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const persisted = User.create('Alice', 'alice@example.test', 'engineering');
    const findOne = vi.fn().mockResolvedValue(persisted);
    const store = {
      get em() {
        return { findOne };
      },
    };
    const repository = new GetUserQueryRepository(cache, store as never);
    const query = new GetUserQuery({
      userId: persisted.id,
      department: 'engineering',
    });

    const result = await repository.find(query);

    expect(result).toBe(persisted);
    expect(findOne).toHaveBeenCalledOnce();
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('caches a serialized snapshot on cache miss instead of live aggregate instance', async () => {
    const persisted = User.create('Charlie', 'charlie@example.test', 'support');
    const cache = await cacheHolding();
    const store = {
      em: {
        findOne: vi.fn().mockResolvedValue(persisted),
      },
    };
    const repository = new GetUserQueryRepository(cache, store as never);
    const query = new GetUserQuery({ userId: persisted.id });

    const result = await runWithTenant('tenant', () => repository.find(query));

    expect(result).toBe(persisted);
    const idKey = filterCacheKey(
      User.aggregateName,
      { id: persisted.id },
      'tenant',
    );
    const cached = await cache.get(idKey);
    expect(cached).not.toBeInstanceOf(User);
    expect(cached).toEqual(JSON.parse(JSON.stringify(persisted.toJSON())));
  });

  it('always hydrates on cache hit into domain entity with Date instances', async () => {
    const persisted = User.create('Dana', 'dana@example.test', 'finance');
    const cache = await cacheHolding(persisted.toJSON());
    const store = { em: { findOne: vi.fn() } };
    const repository = new GetUserQueryRepository(cache, store as never);
    const query = new GetUserQuery({ userId: persisted.id });

    const result = await runWithTenant('tenant', () => repository.find(query));

    expect(result).toBeInstanceOf(User);
    expect(store.em.findOne).not.toHaveBeenCalled();
    expect(result?.id).toBe(persisted.id);
    expect(result?.username).toBe('Dana');
    expect(result?.createdAt).toBeInstanceOf(Date);
    expect(result?.updatedAt).toBeInstanceOf(Date);
  });
});
