/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { runWithTenant } from '@cqrs-ddd/core/application';
import { filterCacheKey, MemoryCache } from '@cqrs-ddd/core/persistence';
import { describe, expect, it, vi } from 'vitest';
import { GetRoleQuery } from '../cqrs/queries/get-role.query';
import { Role, type RoleSnapshot } from '../domain/models/role.entity';
import { GetRoleQueryRepository } from './get-role.query-repository';

const roleKey = (id: string) =>
  filterCacheKey(Role.aggregateName, { id }, 'tenant');

/** A real revision-fenced adapter, optionally holding `role`'s snapshot. */
async function cacheHolding(role?: Role): Promise<MemoryCache<RoleSnapshot>> {
  const cache = new MemoryCache<RoleSnapshot>({ defaultTtlMs: 60_000 });
  if (role) await cache.set(roleKey(role.id), role.toJSON());
  return cache;
}

async function createCachedRoleFixture() {
  const role = Role.create('admin');
  const cache = await cacheHolding(role);
  const findOne = vi.fn();
  const store = {
    get em() {
      return { findOne };
    },
  };

  return {
    role,
    cache,
    findOne,
    queryRepository: new GetRoleQueryRepository(cache, store as never),
  };
}

describe('GetRoleQueryRepository cache hydration', () => {
  it('hydrates a cached role snapshot for GetRoleQuery by default', async () => {
    const { role, cache, findOne, queryRepository } =
      await createCachedRoleFixture();
    const readState = vi.spyOn(cache, 'readState');

    const result = await runWithTenant('tenant', () =>
      queryRepository.find(new GetRoleQuery({ roleId: role.id })),
    );

    expect(result).toBeInstanceOf(Role);
    expect(result?.name).toBe('admin');
    expect(readState).toHaveBeenCalledWith(roleKey(role.id));
    expect(findOne).not.toHaveBeenCalled();
  });

  it('caches snapshot and returns domain aggregate on cache miss', async () => {
    const role = Role.create('editor');
    const cache = await cacheHolding();
    const findOne = vi.fn().mockResolvedValue(role);
    const store = {
      get em() {
        return { findOne };
      },
    };
    const queryRepository = new GetRoleQueryRepository(cache, store as never);

    const result = await runWithTenant('tenant', () =>
      queryRepository.find(new GetRoleQuery({ roleId: role.id })),
    );

    expect(result).toBe(role);
    const cached = await cache.get(roleKey(role.id));
    expect(cached).not.toBeInstanceOf(Role);
    expect(cached).toEqual(JSON.parse(JSON.stringify(role.toJSON())));
  });
});
