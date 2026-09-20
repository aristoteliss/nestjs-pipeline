/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { sessionUserStore } from '@common/context/session-user.store';
import type { SessionUser } from '@common/types/SessionUser';
import type { EventBus } from '@nestjs/cqrs';
import {
  buildAbility,
  CASL_ABILITY_KEY,
  CASL_PRINCIPAL_KEY,
  type Capability,
  type CaslAuthorizer,
} from '@nestjs-pipeline/casl';
import { PipelineContext, SET_TENANT_ID } from '@nestjs-pipeline/core';
import {
  IDEMPOTENCY_REPLAYED_ITEM,
  IdempotencyBehavior,
  IdempotencyConflictError,
  MemoryIdempotencyStore,
} from '@nestjs-pipeline/idempotency';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateUserCommand } from '../src/users/cqrs/commands/create-user.command';
import {
  CreateUserHandler,
  createUserIdempotencyKey,
  createUserReplayScope,
} from '../src/users/cqrs/commands/create-user.handler';
import { User } from '../src/users/domain/models/user.entity';

type RawRules = Capability[];

const PRINCIPAL: SessionUser = {
  id: 'admin-1',
  principalType: 'user',
  tenant: 'tenant',
};

/**
 * The operation key stays stable across permission changes; only the stored
 * replay scope decides whether a completed response may be returned again.
 */
describe('Create user replay scope', () => {
  let store: MemoryIdempotencyStore;
  let save: ReturnType<typeof vi.fn>;
  let handler: CreateUserHandler;

  /**
   * AsyncLocalStorage does not carry from `beforeEach` into a test's own
   * context, so each test enters the principal scope itself.
   */
  function authenticated(user: SessionUser = PRINCIPAL): void {
    sessionUserStore.enterWith(user);
  }

  beforeEach(() => {
    store = new MemoryIdempotencyStore();
    save = vi.fn(async (user: User) => user.toJSON());
    handler = new CreateUserHandler(
      { save } as never,
      { authorize: vi.fn() } as unknown as CaslAuthorizer,
      { publishAll: vi.fn() } as unknown as EventBus,
    );
  });

  function contextFor(rules: RawRules): PipelineContext<CreateUserCommand> {
    const context = new PipelineContext(
      new CreateUserCommand({
        username: 'Alice',
        email: 'alice@example.test',
      }),
      {
        handlerType: CreateUserHandler,
        handlerName: 'CreateUserHandler',
        requestKind: 'command',
      },
    );
    context[SET_TENANT_ID]('tenant');
    context.items.set(CASL_ABILITY_KEY, buildAbility(rules));
    context.items.set(CASL_PRINCIPAL_KEY, { id: PRINCIPAL.id });
    return context;
  }

  const behavior = () =>
    new IdempotencyBehavior(store, {
      keyFactory: createUserIdempotencyKey,
      replayScopeFactory: createUserReplayScope,
    });

  const createRule: RawRules = [{ action: 'create', subject: 'User' }];

  async function run(
    rules: RawRules,
  ): Promise<{ context: PipelineContext<CreateUserCommand>; result: unknown }> {
    const context = contextFor(rules);
    const result = await behavior().handle(context, () =>
      handler.execute(context.request),
    );
    return { context, result };
  }

  it('replays to the same principal holding the same permissions', async () => {
    authenticated();
    const first = await run(createRule);
    const second = await run(createRule);

    expect(second.result).toEqual(
      JSON.parse(JSON.stringify(first.result as object)),
    );
    expect(second.context.items.get(IDEMPOTENCY_REPLAYED_ITEM)).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps the operation key stable when permissions change', async () => {
    authenticated();
    const wide = contextFor([
      ...createRule,
      { action: 'read', subject: 'all' },
    ]);
    const narrow = contextFor(createRule);

    expect(createUserIdempotencyKey(wide)).toBe(
      createUserIdempotencyKey(narrow),
    );
    expect(createUserReplayScope(wide)).not.toBe(createUserReplayScope(narrow));
  });

  it('refuses to replay to a caller whose permissions changed, and does not create again', async () => {
    authenticated();
    await run(createRule);

    const changed = contextFor([
      ...createRule,
      { action: 'read', subject: 'all' },
    ]);
    await expect(
      behavior().handle(changed, () => handler.execute(changed.request)),
    ).rejects.toMatchObject({ reason: 'replay_scope', statusCode: 409 });

    expect(save).toHaveBeenCalledTimes(1);
    expect(changed.items.get(IDEMPOTENCY_REPLAYED_ITEM)).toBeUndefined();
  });

  it('separates two principals sharing an id by their classification', async () => {
    authenticated();
    const asUser = createUserIdempotencyKey(contextFor(createRule));

    authenticated({ ...PRINCIPAL, principalType: 'service' });
    const asService = createUserIdempotencyKey(contextFor(createRule));

    expect(asService).not.toBe(asUser);
    expect(asUser).toContain(':user:admin-1:');
    expect(asService).toContain(':service:admin-1:');
  });

  it('rejects the operation before claiming a key when the ability is absent', async () => {
    authenticated();
    const context = new PipelineContext(
      new CreateUserCommand({
        username: 'Alice',
        email: 'alice@example.test',
      }),
      {
        handlerType: CreateUserHandler,
        handlerName: 'CreateUserHandler',
        requestKind: 'command',
      },
    );
    context[SET_TENANT_ID]('tenant');

    const next = vi.fn();
    await expect(behavior().handle(context, next)).rejects.toThrow(
      /Missing authorization context/,
    );

    expect(next).not.toHaveBeenCalled();
    expect(await store.get(createUserIdempotencyKey(context))).toBeUndefined();
  });

  it('refuses a record created before scope capture rather than replaying it', async () => {
    authenticated();
    const legacy = contextFor(createRule);
    await new IdempotencyBehavior(store, {
      keyFactory: createUserIdempotencyKey,
    }).handle(legacy, () => handler.execute(legacy.request));

    const scoped = contextFor(createRule);
    await expect(
      behavior().handle(scoped, () => handler.execute(scoped.request)),
    ).rejects.toThrow(IdempotencyConflictError);

    expect(save).toHaveBeenCalledTimes(1);
  });
});
