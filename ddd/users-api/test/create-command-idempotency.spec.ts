/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { sessionUserStore } from '@common/context/session-user.store';
import type { CommandBus, EventBus, QueryBus } from '@nestjs/cqrs';
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
import {
  Role,
  type RoleSnapshot,
} from '../src/roles/domain/models/role.entity';
import { toRoleResponseDto } from '../src/roles/dtos/role.dto';
import { UsersController } from '../src/users/controllers/users.controller';
import { CreateUserCommand } from '../src/users/cqrs/commands/create-user.command';
import {
  CreateUserHandler,
  createUserIdempotencyKey,
} from '../src/users/cqrs/commands/create-user.handler';
import { GetUserQuery } from '../src/users/cqrs/queries/get-user.query';
import { UserCreatedEvent } from '../src/users/domain/events/user-created.event';
import {
  User,
  type UserSnapshot,
} from '../src/users/domain/models/user.entity';
import { toResponseDto } from '../src/users/dtos/user.dto';

function tenantContext<T>(context: PipelineContext<T>): PipelineContext<T> {
  context[SET_TENANT_ID]('tenant');
  return context;
}

/**
 * The operation key and the replay scope are both principal-scoped and fail
 * closed, so these compositions run as an authenticated principal.
 */
function asAuthenticatedPrincipal(): void {
  sessionUserStore.enterWith({
    id: 'admin-1',
    principalType: 'user',
    tenant: 'tenant',
  });
}

describe('Create command idempotency composition', () => {
  it.each([undefined, 'Engineering'])(
    'replays user creation with department %s without another write or event',
    async (department) => {
      asAuthenticatedPrincipal();
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

  it('answers a replayed user creation from a fresh authorized read', async () => {
    asAuthenticatedPrincipal();
    const save = vi.fn(async (user: User) => user.toJSON());
    const publishAll = vi.fn();
    const handler = new CreateUserHandler(
      { save },
      { authorize: vi.fn() } as unknown as CaslAuthorizer,
      { publishAll } as unknown as EventBus,
    );
    const behavior = new IdempotencyBehavior(new MemoryIdempotencyStore(), {
      keyFactory: createUserIdempotencyKey,
    });
    const commandBus = {
      execute: vi.fn((command: CreateUserCommand) => {
        const context = tenantContext(
          new PipelineContext(command, {
            handlerType: CreateUserHandler,
            handlerName: 'CreateUserHandler',
            requestKind: 'command',
          }),
        );
        return behavior.handle(context, () => handler.execute(command));
      }),
    } as unknown as CommandBus;
    const queryBus = {
      execute: vi.fn(async (query: GetUserQuery) => ({
        id: query.userId,
        username: 'Alicia',
      })),
    } as unknown as QueryBus;
    const controller = new UsersController(commandBus, queryBus);
    const dto = { name: 'Alice', email: 'alice@example.test' };

    const first = await controller.createUser(dto);
    const replay = await controller.createUser(dto);

    const created = save.mock.calls[0][0];
    expect(save).toHaveBeenCalledTimes(1);
    expect(publishAll).toHaveBeenCalledOnce();
    expect(queryBus.execute).toHaveBeenCalledTimes(2);
    for (const [query] of vi.mocked(queryBus.execute).mock.calls) {
      expect(query).toBeInstanceOf(GetUserQuery);
      expect((query as GetUserQuery).userId).toBe(created.id);
    }
    expect(first).toEqual({ id: created.id, name: 'Alicia' });
    expect(replay).toEqual(first);
  });

  it('replays role creation without another write or event', async () => {
    asAuthenticatedPrincipal();
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
