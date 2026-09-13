import type { EventBus } from '@nestjs/cqrs';
import type { CaslAuthorizer } from '@nestjs-pipeline/casl';
import { PipelineContext, SET_TENANT_ID } from '@nestjs-pipeline/core';
import {
  IDEMPOTENCY_REPLAYED_ITEM,
  IdempotencyBehavior,
  MemoryIdempotencyStore,
} from '@nestjs-pipeline/idempotency';
import { describe, expect, it, vi } from 'vitest';
import { CreateRoleCommand } from '../src/roles/cqrs/commands/create-role.command';
import {
  CreateRoleHandler,
  createRoleIdempotencyKey,
} from '../src/roles/cqrs/commands/create-role.handler';
import { RoleCreatedEvent } from '../src/roles/domain/events/role-created.event';
import { Role, type RoleSnapshot } from '../src/roles/domain/models/role.entity';
import { toRoleResponseDto } from '../src/roles/dtos/role.dto';
import { CreateUserCommand } from '../src/users/cqrs/commands/create-user.command';
import {
  CreateUserHandler,
  createUserIdempotencyKey,
} from '../src/users/cqrs/commands/create-user.handler';
import { UserCreatedEvent } from '../src/users/domain/events/user-created.event';
import { User, type UserSnapshot } from '../src/users/domain/models/user.entity';
import { toResponseDto } from '../src/users/dtos/user.dto';

function tenantContext<T>(context: PipelineContext<T>): PipelineContext<T> {
  context[SET_TENANT_ID]('tenant');
  return context;
}

describe('Create command idempotency composition', () => {
  it.each([undefined, 'Engineering'])(
    'replays user creation with department %s without another write or event',
    async (department) => {
      const save = vi.fn(async (user: User) => user.toJSON());
      const publishAll = vi.fn();
      const handler = new CreateUserHandler(
        { save },
        { authorize: vi.fn() } as unknown as CaslAuthorizer,
        { publishAll } as unknown as EventBus,
      );
      const context = () =>
        tenantContext(
          new PipelineContext(
            new CreateUserCommand({
              username: 'Alice',
              email: 'alice@example.test',
              ...(department === undefined ? {} : { department }),
            }),
            {
              handlerType: CreateUserHandler,
              handlerName: 'CreateUserHandler',
              requestKind: 'command',
            },
          ),
        );
      const store = new MemoryIdempotencyStore();
      const behavior = new IdempotencyBehavior(store, {
        keyFactory: createUserIdempotencyKey,
      });
      const firstContext = context();
      const first = await behavior.handle(firstContext, () =>
        handler.execute(firstContext.request),
      );
      const record = await store.get(createUserIdempotencyKey(firstContext));
      expect(record?.status).toBe('completed');
      expect(record?.response).toEqual(JSON.parse(JSON.stringify(first)));

      const replayContext = context();
      const replayNext = vi.fn(() => handler.execute(replayContext.request));
      const replay = await behavior.handle(replayContext, replayNext);
      expect(replay).toEqual(record?.response);
      expect(toResponseDto(replay as UserSnapshot)).toEqual(
        toResponseDto(first as UserSnapshot),
      );
      expect(replayContext.items.get(IDEMPOTENCY_REPLAYED_ITEM)).toBe(true);
      expect(replayNext).not.toHaveBeenCalled();
      expect(save).toHaveBeenCalledTimes(1);
      const aggregate = save.mock.calls[0][0];
      expect(aggregate).toBeInstanceOf(User);
      expect(publishAll).toHaveBeenCalledExactlyOnceWith([
        expect.any(UserCreatedEvent),
      ]);
      expect(aggregate.getUncommittedEvents()).toHaveLength(0);
    },
  );

  it('replays role creation without another write or event', async () => {
    const save = vi.fn(async (role: Role) => role.toJSON());
    const publishAll = vi.fn();
    const handler = new CreateRoleHandler(
      { save },
      { authorize: vi.fn() } as unknown as CaslAuthorizer,
      { publishAll } as unknown as EventBus,
    );
    const context = () =>
      tenantContext(
        new PipelineContext(new CreateRoleCommand({ name: 'admin' }), {
          handlerType: CreateRoleHandler,
          handlerName: 'CreateRoleHandler',
          requestKind: 'command',
        }),
      );
    const store = new MemoryIdempotencyStore();
    const behavior = new IdempotencyBehavior(store, {
      keyFactory: createRoleIdempotencyKey,
    });
    const firstContext = context();
    const first = await behavior.handle(firstContext, () =>
      handler.execute(firstContext.request),
    );
    const record = await store.get(createRoleIdempotencyKey(firstContext));
    expect(record?.status).toBe('completed');
    expect(record?.response).toEqual(JSON.parse(JSON.stringify(first)));

    const replayContext = context();
    const replayNext = vi.fn(() => handler.execute(replayContext.request));
    const replay = await behavior.handle(replayContext, replayNext);
    expect(replay).toEqual(record?.response);
    expect(toRoleResponseDto(replay as RoleSnapshot)).toEqual(
      toRoleResponseDto(first as RoleSnapshot),
    );
    expect(replayContext.items.get(IDEMPOTENCY_REPLAYED_ITEM)).toBe(true);
    expect(replayNext).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    const aggregate = save.mock.calls[0][0];
    expect(aggregate).toBeInstanceOf(Role);
    expect(publishAll).toHaveBeenCalledExactlyOnceWith([
      expect.any(RoleCreatedEvent),
    ]);
    expect(aggregate.getUncommittedEvents()).toHaveLength(0);
  });
});
