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
});
