/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MemoryCache } from '@cqrs-ddd/core/persistence';
import { runWithTenant } from '@nestjs-pipeline/tenant';
import { UserPermissionRule } from '@persistence/entities/user-permission-rule.entity';
import { describe, expect, it, vi } from 'vitest';
import { GetUserPermissionRulesQuery } from '../application/cqrs/queries/get-user-permission-rules.query';
import { GetUserPermissionRulesRepository } from './get-user-permission-rules.query-repository';

describe('GetUserPermissionRulesRepository', () => {
  it('reads materialized rules ordered by inverted and position', async () => {
    const rawRows = [
      {
        userId: 'user-1',
        position: 1,
        source: 'role',
        roleId: 'role-1',
        capabilityId: 'cap-1',
        subject: 'User',
        action: 'read',
        conditions: null,
        fields: null,
        inverted: false,
        reason: null,
      },
      {
        userId: 'user-1',
        position: 2,
        source: 'role',
        roleId: 'role-1',
        capabilityId: 'cap-2',
        subject: 'User',
        action: 'delete',
        conditions: null,
        fields: null,
        inverted: true,
        reason: null,
      },
    ];

    const find = vi.fn().mockResolvedValue(rawRows);
    const store = { em: { find } };
    const cache = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    const repo = new GetUserPermissionRulesRepository(
      cache as never,
      store as never,
    );

    const result = await runWithTenant('tenant', () =>
      repo.find(new GetUserPermissionRulesQuery({ userId: 'user-1' })),
    );

    expect(find).toHaveBeenCalledWith(
      UserPermissionRule,
      { userId: 'user-1' },
      { orderBy: [{ inverted: 'asc' }, { position: 'asc' }] },
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(
      expect.objectContaining({
        subject: 'User',
        action: 'read',
      }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        subject: 'User',
        action: 'delete',
        inverted: true,
      }),
    );
  });

  it('serves cached rules on subsequent reads and bypasses cache when refresh is requested', async () => {
    const rawRows = [
      {
        userId: 'user-cached',
        position: 1,
        source: 'role',
        roleId: 'role-1',
        capabilityId: 'cap-1',
        subject: 'User',
        action: 'read',
        conditions: null,
        fields: null,
        inverted: false,
        reason: null,
      },
    ];

    const find = vi.fn().mockResolvedValue(rawRows);
    const store = { em: { find } };
    const cache = new MemoryCache({ defaultTtlMs: 60_000 });
    const repo = new GetUserPermissionRulesRepository(
      cache as never,
      store as never,
    );

    const query = new GetUserPermissionRulesQuery({ userId: 'user-cached' });

    // First read populates cache from store
    const firstResult = await runWithTenant('tenant', () => repo.find(query));
    expect(firstResult).toHaveLength(1);
    expect(find).toHaveBeenCalledTimes(1);

    // Second read hits cache, does not hit store
    const secondResult = await runWithTenant('tenant', () => repo.find(query));
    expect(secondResult).toEqual(firstResult);
    expect(find).toHaveBeenCalledTimes(1);

    // Refresh query bypasses cache and hits store again
    const refreshQuery = new GetUserPermissionRulesQuery(
      { userId: 'user-cached' },
      { refresh: true },
    );
    const refreshedResult = await runWithTenant('tenant', () =>
      repo.find(refreshQuery),
    );
    expect(refreshedResult).toEqual(firstResult);
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('maps conditions, comma-separated fields, and reason properly from rows', async () => {
    const rawRows = [
      {
        userId: 'user-detailed',
        position: 1,
        source: 'role',
        roleId: 'role-1',
        capabilityId: 'cap-1',
        subject: 'User',
        action: 'read',
        conditions: JSON.stringify({ department: 'sales' }),
        fields: 'id,username,email',
        inverted: false,
        reason: 'Sales department read permission',
      },
      {
        userId: 'user-detailed',
        position: 2,
        source: 'role',
        roleId: 'role-1',
        capabilityId: 'cap-2',
        subject: 'User',
        action: 'delete',
        conditions: null,
        fields: null,
        inverted: true,
        reason: '',
      },
    ];

    const find = vi.fn().mockResolvedValue(rawRows);
    const store = { em: { find } };
    const cache = new MemoryCache();
    const repo = new GetUserPermissionRulesRepository(
      cache as never,
      store as never,
    );

    const result = await runWithTenant('tenant', () =>
      repo.find(new GetUserPermissionRulesQuery({ userId: 'user-detailed' })),
    );

    expect(result).toEqual([
      {
        subject: 'User',
        action: 'read',
        conditions: { department: 'sales' },
        fields: ['id', 'username', 'email'],
        inverted: false,
        reason: 'Sales department read permission',
      },
      {
        subject: 'User',
        action: 'delete',
        conditions: undefined,
        fields: undefined,
        inverted: true,
        reason: undefined,
      },
    ]);
  });

  it('returns an empty array when no rules exist for the user', async () => {
    const find = vi.fn().mockResolvedValue([]);
    const store = { em: { find } };
    const cache = new MemoryCache();
    const repo = new GetUserPermissionRulesRepository(
      cache as never,
      store as never,
    );

    const result = await runWithTenant('tenant', () =>
      repo.find(new GetUserPermissionRulesQuery({ userId: 'user-none' })),
    );

    expect(result).toEqual([]);
  });
});
