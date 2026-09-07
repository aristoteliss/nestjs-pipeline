import { describe, expect, it, vi } from 'vitest';
import { GetUserContextQuery } from '../cqrs/queries/get-user-context.query';
import { User } from '../domain/models/user.entity';
import { GetUserContextQueryRepository } from './get-user-context.query-repository';

describe('GetUserContextQueryRepository', () => {
  it('reads current authorization context from persistence on every lookup', async () => {
    const user = User.create('Alice', 'alice@example.test', 'engineering');
    const findOne = vi.fn().mockResolvedValue(user);
    const repository = new GetUserContextQueryRepository({
      get em() {
        return { findOne };
      },
    } as never);
    const query = new GetUserContextQuery({ userId: user.id });

    await repository.find(query);
    await repository.find(query);

    expect(findOne).toHaveBeenCalledTimes(2);
    expect(findOne).toHaveBeenCalledWith(User, { id: user.id });
  });

  it('returns null when the persisted user no longer exists', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const repository = new GetUserContextQueryRepository({
      get em() {
        return { findOne };
      },
    } as never);

    await expect(
      repository.find(
        new GetUserContextQuery({
          userId: '019de10c-b680-7000-8000-000000000099',
        }),
      ),
    ).resolves.toBeNull();
  });
});
