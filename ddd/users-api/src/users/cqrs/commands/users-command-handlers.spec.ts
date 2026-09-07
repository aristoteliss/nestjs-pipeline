import type { EventBus } from '@nestjs/cqrs';
import type { CaslAuthorizer } from '@nestjs-pipeline/casl';
import type { IWriteSideAggregateRepository } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { User, type UserSnapshot } from '../../domain/models/user.entity';
import { DeleteUserCommand } from './delete-user.command';
import { DeleteUserHandler } from './delete-user.handler';
import { UpdateUserCommand } from './update-user.command';
import { UpdateUserHandler } from './update-user.handler';

describe('Users CQRS write-side hydration', () => {
  const authorizer = { authorize: vi.fn() } as unknown as CaslAuthorizer;
  const eventBus = { publishAll: vi.fn() } as unknown as EventBus;

  it('UpdateUserHandler hydrates from the command repository, not a read-side cache', async () => {
    const existing = User.create('Alice', 'alice@example.test', 'Engineering');
    existing.uncommit();
    const repository = {
      findById: vi.fn().mockResolvedValue(existing.toJSON()),
      save: vi.fn().mockResolvedValue(existing.toJSON()),
    } as unknown as IWriteSideAggregateRepository<User, UserSnapshot, UserSnapshot>;
    const handler = new UpdateUserHandler(repository, authorizer, eventBus);

    const result = await handler.execute(new UpdateUserCommand({ id: existing.id, username: 'Alicia' }));

    expect(repository.findById).toHaveBeenCalledWith(existing.id);
    expect(result.username).toBe('Alicia');
    expect(repository.save).toHaveBeenCalledWith(result);
  });

  it('DeleteUserHandler hydrates from the command repository before deletion', async () => {
    const existing = User.create('Bob', 'bob@example.test');
    existing.uncommit();
    const repository = {
      findById: vi.fn().mockResolvedValue(existing.toJSON()),
      save: vi.fn().mockResolvedValue(null),
    } as unknown as IWriteSideAggregateRepository<User, UserSnapshot, null>;
    const handler = new DeleteUserHandler(repository, authorizer, eventBus);

    const result = await handler.execute(new DeleteUserCommand({ id: existing.id }));

    expect(repository.findById).toHaveBeenCalledWith(existing.id);
    expect(repository.save).toHaveBeenCalledWith(result);
  });
});
