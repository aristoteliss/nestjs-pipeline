/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { runWithTenant } from '@cqrs-ddd/core/application';
import { MemoryCache } from '@cqrs-ddd/core/persistence';
import {
  buildAbility,
  CASL_ABILITY_KEY,
  type CapabilityString,
  CaslAuthorizer,
  UnauthorizedActionException,
} from '@nestjs-pipeline/casl';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetRoleHandler } from '../src/roles/cqrs/queries/get-role.handler';
import { GetRoleQuery } from '../src/roles/cqrs/queries/get-role.query';
import { GetRolesHandler } from '../src/roles/cqrs/queries/get-roles.handler';
import { GetRolesQuery } from '../src/roles/cqrs/queries/get-roles.query';
import {
  Role,
  type RoleSnapshot,
} from '../src/roles/domain/models/role.entity';
import { GetRoleQueryRepository } from '../src/roles/persistence/get-role.query-repository';
import { GetUserHandler } from '../src/users/cqrs/queries/get-user.handler';
import { GetUserQuery } from '../src/users/cqrs/queries/get-user.query';
import { GetUsersHandler } from '../src/users/cqrs/queries/get-users.handler';
import { GetUsersQuery } from '../src/users/cqrs/queries/get-users.query';
import {
  User,
  type UserSnapshot,
} from '../src/users/domain/models/user.entity';
import { GetUserQueryRepository } from '../src/users/persistence/get-user.query-repository';

const TARGET_ID = '019488e0-0000-7000-8000-000000000001';

/**
 * Runs `fn` as a pipeline execution whose CASL ability is `rules`. A real pipeline
 * run also sets @cqrs-ddd/core's tenant scope (`TenantScopeBehavior`).
 */
function asCaller<T>(
  rules: CapabilityString[],
  fn: () => Promise<T>,
): Promise<T> {
  return pipelineStore.run(
    {
      tenantId: 'tenant-a',
      items: new Map([[CASL_ABILITY_KEY, buildAbility(rules)]]),
    } as unknown as IPipelineContext,
    () => runWithTenant('tenant-a', fn),
  );
}

function withId<T extends object>(entity: T): T {
  Object.defineProperty(entity, 'id', { value: TARGET_ID });
  return entity;
}

/**
 * A read whose decision depends on entity attributes must not be decided by a
 * repository-cached snapshot; an unconditional read may still use it. These
 * tests drive the real repositories and a real `MemoryCache`.
 */
describe('User read freshness under conditional rules', () => {
  let stored: User;
  let findOne: ReturnType<typeof vi.fn>;
  let handler: GetUserHandler;

  beforeEach(() => {
    stored = withId(User.create('Bob', 'bob@example.test', 'engineering'));
    findOne = vi.fn().mockImplementation(async () => stored);
    const repository = new GetUserQueryRepository(
      new MemoryCache<UserSnapshot>({ defaultTtlMs: 60_000 }),
      { em: { findOne } } as never,
    );
    handler = new GetUserHandler(repository, new CaslAuthorizer());
  });

  async function warmThenMoveToSales(): Promise<void> {
    await handler.execute(new GetUserQuery({ userId: TARGET_ID }));
    stored = withId(User.create('Bob', 'bob@example.test', 'sales'));
  }

  it('denies a caller whose grant matches only the cached department', async () => {
    await asCaller(['User|read|*'], warmThenMoveToSales);

    await expect(
      asCaller(['User|read|{"department":"engineering"}'], () =>
        handler.execute(new GetUserQuery({ userId: TARGET_ID })),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedActionException);
  });

  it('allows a caller whose grant matches the current department', async () => {
    await asCaller(['User|read|*'], warmThenMoveToSales);

    await expect(
      asCaller(['User|read|{"department":"sales"}'], () =>
        handler.execute(new GetUserQuery({ userId: TARGET_ID })),
      ),
    ).resolves.toMatchObject({ department: 'sales' });
  });

  it('serves an unconditional read from the repository cache', async () => {
    await asCaller(['User|read|*'], async () => {
      await handler.execute(new GetUserQuery({ userId: TARGET_ID }));
      await handler.execute(new GetUserQuery({ userId: TARGET_ID }));
    });

    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('keeps the incoming query options when it forces a fresh read', async () => {
    const repository = { find: vi.fn().mockResolvedValue(stored) };
    const sessionUser = { id: 'viewer', principalType: 'user' };

    await asCaller(['User|read|{"department":"engineering"}'], () =>
      new GetUserHandler(repository, new CaslAuthorizer()).execute(
        new GetUserQuery({ userId: TARGET_ID }, { hydrate: true }, sessionUser),
      ),
    );

    const [query] = repository.find.mock.calls[0] as [GetUserQuery];
    expect(query).toMatchObject({ userId: TARGET_ID });
    expect(query.refresh).toBe(true);
    expect(query.hydrate).toBe(true);
    expect(query.sessionUser).toBe(sessionUser);
  });
});

describe('Role read freshness under conditional rules', () => {
  let stored: Role;
  let findOne: ReturnType<typeof vi.fn>;
  let handler: GetRoleHandler;

  beforeEach(() => {
    stored = withId(Role.create('editor'));
    findOne = vi.fn().mockImplementation(async () => stored);
    const repository = new GetRoleQueryRepository(
      new MemoryCache<RoleSnapshot>({ defaultTtlMs: 60_000 }),
      { em: { findOne } } as never,
    );
    handler = new GetRoleHandler(repository, new CaslAuthorizer());
  });

  it('denies a caller whose grant matches only the cached name', async () => {
    await asCaller(['Role|read|*'], async () => {
      await handler.execute(new GetRoleQuery({ roleId: TARGET_ID }));
      stored = withId(Role.create('publisher'));
    });

    await expect(
      asCaller(['Role|read|{"name":"editor"}'], () =>
        handler.execute(new GetRoleQuery({ roleId: TARGET_ID })),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedActionException);
    await expect(
      asCaller(['Role|read|{"name":"publisher"}'], () =>
        handler.execute(new GetRoleQuery({ roleId: TARGET_ID })),
      ),
    ).resolves.toEqual({ id: TARGET_ID, name: 'publisher' });
  });

  it('serves an unconditional read from the repository cache', async () => {
    await asCaller(['Role|read|*'], async () => {
      await handler.execute(new GetRoleQuery({ roleId: TARGET_ID }));
      await handler.execute(new GetRoleQuery({ roleId: TARGET_ID }));
    });

    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('asks the ORM for a refreshed row only when the query demands it', async () => {
    const repository = new GetRoleQueryRepository(
      new MemoryCache<RoleSnapshot>({ defaultTtlMs: 60_000 }),
      { em: { findOne } } as never,
    );

    await asCaller(['Role|read|*'], async () => {
      await repository.find(new GetRoleQuery({ roleId: TARGET_ID }));
      await repository.find(
        new GetRoleQuery({ roleId: TARGET_ID }, { refresh: true }),
      );
    });

    expect(findOne.mock.calls[0][2]).toBeUndefined();
    expect(findOne.mock.calls[1][2]).toEqual({ refresh: true });
  });
});

describe('Authorized lists', () => {
  const alice = User.create('Alice', 'alice@example.test', 'engineering');
  const carol = User.create('Carol', 'carol@example.test', 'sales');
  const users = { find: vi.fn().mockResolvedValue([alice, carol]) };

  function readUsers(rules: CapabilityString[]) {
    return new GetUsersHandler(
      users,
      new CaslAuthorizer(buildAbility(rules)),
    ).execute(new GetUsersQuery({}));
  }

  it('omits hidden rows and denied fields', async () => {
    await expect(
      readUsers([
        'User|read|{"department":"engineering"}',
        '!User|read|*|email',
      ]),
    ).resolves.toEqual([
      { id: alice.id, username: 'Alice', department: 'engineering' },
    ]);
  });

  it('returns an empty list when nothing is readable', async () => {
    await expect(readUsers(['Role|read|*'])).resolves.toEqual([]);
  });

  it('applies the same rules to roles', async () => {
    const admin = Role.create('admin');
    const viewer = Role.create('viewer');

    await expect(
      new GetRolesHandler(
        { find: vi.fn().mockResolvedValue([admin, viewer]) },
        new CaslAuthorizer(
          buildAbility(['Role|read|{"name":"viewer"}', '!Role|read|*|id']),
        ),
      ).execute(new GetRolesQuery({})),
    ).resolves.toEqual([{ name: 'viewer' }]);
  });
});
