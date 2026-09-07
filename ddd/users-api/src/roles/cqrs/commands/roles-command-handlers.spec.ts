import type { EventBus } from '@nestjs/cqrs';
import type { CaslAuthorizer } from '@nestjs-pipeline/casl';
import type { IWriteSideAggregateRepository } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { Role, type RoleSnapshot } from '../../domain/models/role.entity';
import { DeleteRoleCommand } from './delete-role.command';
import { DeleteRoleHandler } from './delete-role.handler';
import { UpdateRoleCommand } from './update-role.command';
import { UpdateRoleHandler } from './update-role.handler';

describe('Roles CQRS write-side hydration', () => {
  const authorizer = { authorize: vi.fn() } as unknown as CaslAuthorizer;
  const eventBus = { publishAll: vi.fn() } as unknown as EventBus;

  it('UpdateRoleHandler hydrates from authoritative command persistence', async () => {
    const existing = Role.create('editor');
    existing.uncommit();
    const repository = {
      findById: vi.fn().mockResolvedValue(existing.toJSON()),
      save: vi.fn().mockResolvedValue(existing.toJSON()),
    } as unknown as IWriteSideAggregateRepository<Role, RoleSnapshot, RoleSnapshot>;
    const handler = new UpdateRoleHandler(repository, authorizer, eventBus);

    const result = await handler.execute(new UpdateRoleCommand({ id: existing.id, name: 'publisher' }));

    expect(repository.findById).toHaveBeenCalledWith(existing.id);
    expect(result.name).toBe('publisher');
    expect(repository.save).toHaveBeenCalledWith(result);
  });

  it('DeleteRoleHandler hydrates from authoritative command persistence', async () => {
    const existing = Role.create('viewer');
    existing.uncommit();
    const repository = {
      findById: vi.fn().mockResolvedValue(existing.toJSON()),
      save: vi.fn().mockResolvedValue(null),
    } as unknown as IWriteSideAggregateRepository<Role, RoleSnapshot, null>;
    const handler = new DeleteRoleHandler(repository, authorizer, eventBus);

    const result = await handler.execute(new DeleteRoleCommand({ id: existing.id }));

    expect(repository.findById).toHaveBeenCalledWith(existing.id);
    expect(repository.save).toHaveBeenCalledWith(result);
  });
});
