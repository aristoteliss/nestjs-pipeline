/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { buildAbility, CaslAuthorizer } from '@nestjs-pipeline/casl';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { runWithTenant } from '@nestjs-pipeline/ddd-core/application';
import { MemoryCache } from '@nestjs-pipeline/ddd-core/persistence';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetUserQuery } from '../src/users/cqrs/queries/get-user.query';
import { GetUserOverviewHandler } from '../src/users/cqrs/queries/get-user-overview.handler';
import { GetUserOverviewQuery } from '../src/users/cqrs/queries/get-user-overview.query';
import {
  User,
  type UserSnapshot,
} from '../src/users/domain/models/user.entity';
import { GetUserQueryRepository } from '../src/users/persistence/get-user.query-repository';

/**
 * The overview handler authorizes a department-scoped viewer against the user it
 * loads. A repository cache that can answer that load with a snapshot from
 * before a department change would decide access on state that no longer exists,
 * so the read declares `refresh: true`. These tests drive the real
 * `GetUserQueryRepository` and a real `MemoryCache` so the guarantee is checked
 * against the decorator configuration the application actually ships.
 */
describe('User overview repository cache freshness', () => {
  const TARGET_ID = '019488e0-0000-7000-8000-000000000001';

  let cache: MemoryCache<UserSnapshot>;
  let stored: User;
  let findOne: ReturnType<typeof vi.fn>;
  let repository: GetUserQueryRepository;

  function userInDepartment(department: string): User {
    const user = User.create('Bob', 'bob@example.test', department);
    Object.defineProperty(user, 'id', { value: TARGET_ID });
    return user;
  }

  beforeEach(() => {
    cache = new MemoryCache<UserSnapshot>({ defaultTtlMs: 60_000 });
    stored = userInDepartment('engineering');
    findOne = vi.fn().mockImplementation(async () => stored);
    repository = new GetUserQueryRepository(cache, {
      em: { findOne },
    } as never);
  });

  /**
   * The repository cache key is tenant-scoped and fails closed without one. A real
   * pipeline run also sets ddd-core's tenant scope (`TenantScopeBehavior`).
   */
  function inTenant<T>(run: () => Promise<T>): Promise<T> {
    return pipelineStore.run(
      { tenantId: 'tenant-a' } as unknown as IPipelineContext,
      () => runWithTenant('tenant-a', run),
    );
  }

  function handlerFor(viewerDepartment: string): GetUserOverviewHandler {
    const ability = buildAbility([
      {
        action: 'read',
        subject: 'User',
        conditions: { department: viewerDepartment },
      },
    ]);

    return new GetUserOverviewHandler(
      repository as never,
      {
        find: vi
          .fn()
          .mockResolvedValue({ roles: [], additionalCapabilities: [] }),
      } as never,
      { find: vi.fn().mockResolvedValue([]) } as never,
      new CaslAuthorizer(ability),
    );
  }

  it('populates the repository cache for a plain lookup', async () => {
    const cached = await inTenant(async () => {
      await repository.find(new GetUserQuery({ userId: TARGET_ID }));
      return repository.find(new GetUserQuery({ userId: TARGET_ID }));
    });

    expect(cached?.department).toBe('engineering');
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('serves a stale department from the cache once the record has moved', async () => {
    const cached = await inTenant(async () => {
      await repository.find(new GetUserQuery({ userId: TARGET_ID }));
      stored = userInDepartment('sales');
      return repository.find(new GetUserQuery({ userId: TARGET_ID }));
    });

    expect(cached?.department).toBe('engineering');
  });

  it('denies a department-scoped viewer whose grant matches only the cached department', async () => {
    await inTenant(async () => {
      await repository.find(new GetUserQuery({ userId: TARGET_ID }));
      stored = userInDepartment('sales');
      findOne.mockClear();

      await expect(
        handlerFor('engineering').execute(
          new GetUserOverviewQuery({ userId: TARGET_ID }),
        ),
      ).rejects.toThrow();
    });

    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('authorizes a viewer scoped to the department the record now belongs to', async () => {
    await inTenant(async () => {
      await repository.find(new GetUserQuery({ userId: TARGET_ID }));
      stored = userInDepartment('sales');

      await expect(
        handlerFor('sales').execute(
          new GetUserOverviewQuery({ userId: TARGET_ID }),
        ),
      ).resolves.toMatchObject({ department: 'sales' });
    });
  });
});
