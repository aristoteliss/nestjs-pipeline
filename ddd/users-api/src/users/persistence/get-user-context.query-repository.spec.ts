import { describe, expect, it, vi } from 'vitest';
import { GetUserContextQuery } from '../cqrs/queries/get-user-context.query';
import { User } from '../domain/models/user.entity';
import { GetUserContextQueryRepository } from './get-user-context.query-repository';

describe('GetUserContextQueryRepository', () => {
  it('reads current authorization context from persistence on every lookup', async () => {
    const user = User.create('Alice', 'alice@example.test', 'engineering');
    const findOne = vi.fn().mockResolvedValue(user);
    const repository = new GetUserContextQueryRepository(
      {
        get em() {
          return { findOne };
        },
      } as never,
      undefined,
    );
    const query = new GetUserContextQuery({ userId: user.id });

    await repository.find(query);
    await repository.find(query);

    expect(findOne).toHaveBeenCalledTimes(2);
  });

  it('resolve returns null when user does not exist in persistence (deleted user revocation)', async () => {
    const deletedUserId = '019de10c-b680-7000-8000-000000000099';
    const findOne = vi.fn().mockResolvedValue(null);
    const repository = new GetUserContextQueryRepository(
      {
        get em() {
          return { findOne };
        },
      } as never,
      ['sessionUser'],
    );

    const context = {
      request: {
        sessionUser: {
          id: deletedUserId,
          department: 'stale-department',
          capabilities: { roles: ['admin'] },
        },
      },
    } as any;

    const result = await repository.resolve(context);

    expect(result).toBeNull();
    expect(findOne).toHaveBeenCalledWith(User, { id: deletedUserId });
  });

  it('resolve supports non-database machine and test principals with capabilities', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const repository = new GetUserContextQueryRepository(
      {
        get em() {
          return { findOne };
        },
      } as never,
      ['sessionUser'],
    );

    const context = {
      request: {
        sessionUser: {
          id: 'admin-1',
          department: 'platform',
          capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
        },
      },
    } as any;

    const result = await repository.resolve(context);

    expect(result).toEqual({
      id: 'admin-1',
      department: 'platform',
      capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
    });
  });

  it('resolve synchronizes current department from persistence and preserves capabilities', async () => {
    const persistedUser = User.create('Bob', 'bob@example.test', 'Executive');
    const findOne = vi.fn().mockResolvedValue(persistedUser);
    const repository = new GetUserContextQueryRepository(
      {
        get em() {
          return { findOne };
        },
      } as never,
      ['sessionUser'],
    );

    const context = {
      request: {
        sessionUser: {
          id: persistedUser.id,
          department: 'old-engineering', // stale department in token
          capabilities: { roles: ['manager'] },
        },
      },
    } as any;

    const result = await repository.resolve(context);

    expect(result).toEqual({
      id: persistedUser.id,
      department: 'Executive', // updated from persistence
      capabilities: { roles: ['manager'] },
    });
  });
});
