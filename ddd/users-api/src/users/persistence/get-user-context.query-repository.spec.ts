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

  it('rejects missing explicit principal classification', async () => {
    const findOne = vi.fn();
    const repository = new GetUserContextQueryRepository(
      {
        get em() {
          return { findOne };
        },
      } as never,
      ['sessionUser'],
    );

    const result = await repository.resolve({
      request: {
        sessionUser: {
          id: '019de10c-b680-7000-8000-000000000099',
          capabilities: { roles: ['admin'] },
        },
      },
    } as any);

    expect(result).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('treats a UUID-looking service id as a service when explicitly classified', async () => {
    const findOne = vi.fn();
    const repository = new GetUserContextQueryRepository(
      {
        get em() {
          return { findOne };
        },
      } as never,
      ['sessionUser'],
    );
    const capabilities = {
      roles: [],
      additionalCapabilities: ['all|manage|*'],
    };

    const result = await repository.resolve({
      request: {
        sessionUser: {
          id: '019de10c-b680-7000-8000-000000000099',
          principalType: 'service',
          department: 'platform',
          capabilities,
        },
      },
    } as any);

    expect(result).toEqual({
      id: '019de10c-b680-7000-8000-000000000099',
      department: 'platform',
      capabilities,
    });
    expect(findOne).not.toHaveBeenCalled();
  });

  it('treats a human-readable user id as a database user when explicitly classified', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const repository = new GetUserContextQueryRepository(
      {
        get em() {
          return { findOne };
        },
      } as never,
      ['sessionUser'],
    );

    const result = await repository.resolve({
      request: {
        sessionUser: {
          id: 'human-readable-user-id',
          principalType: 'user',
          capabilities: { roles: ['admin'] },
        },
      },
    } as any);

    expect(result).toBeNull();
    expect(findOne).toHaveBeenCalledWith(User, { id: 'human-readable-user-id' });
  });

  it('synchronizes current department for user principals and preserves capabilities', async () => {
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

    const result = await repository.resolve({
      request: {
        sessionUser: {
          id: persistedUser.id,
          principalType: 'user',
          department: 'old-engineering',
          capabilities: { roles: ['manager'] },
        },
      },
    } as any);

    expect(result).toEqual({
      id: persistedUser.id,
      department: 'Executive',
      capabilities: { roles: ['manager'] },
    });
  });
});
