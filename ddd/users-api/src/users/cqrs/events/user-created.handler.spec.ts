/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ITenantContext } from '@common/context/tenant-context.port';
import { describe, expect, it, vi } from 'vitest';
import type { IWelcomeEmailDispatcher } from '../../application/ports/user-event-dispatcher.port';
import { UserCreatedEvent } from '../../domain/events/user-created.event';
import { User } from '../../domain/models/user.entity';
import { UserCreatedHandler } from './user-created.handler';

describe('UserCreatedHandler', () => {
  it('dispatches only application data; logging/correlation are cross-cutting concerns', async () => {
    const enqueueWelcomeEmail = vi.fn().mockResolvedValue(undefined);
    const dispatcher = { enqueueWelcomeEmail } as IWelcomeEmailDispatcher;
    const tenantContext = {
      schema: 'tenant_alpha',
    } as unknown as ITenantContext;
    const handler = new UserCreatedHandler(dispatcher, tenantContext);

    const user = User.create('john_doe', 'john@example.com', 'Engineering');
    const [event] = user.getUncommittedEvents() as [UserCreatedEvent];

    await handler.handle(event);

    expect(enqueueWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(enqueueWelcomeEmail).toHaveBeenCalledWith({
      userId: user.id,
      username: 'john_doe',
      email: 'john@example.com',
      tenant: 'tenant_alpha',
    });
  });

  it('isolates handler execution from subsequent in-memory aggregate mutations', async () => {
    const enqueueWelcomeEmail = vi.fn().mockResolvedValue(undefined);
    const dispatcher = { enqueueWelcomeEmail } as IWelcomeEmailDispatcher;
    const tenantContext = {
      schema: 'tenant_beta',
    } as unknown as ITenantContext;
    const handler = new UserCreatedHandler(dispatcher, tenantContext);

    const user = User.create('alice_original', 'alice@example.com');
    const [event] = user.getUncommittedEvents() as [UserCreatedEvent];
    user.update({ username: 'alice_mutated' });

    expect(user.username).toBe('alice_mutated');
    expect(event.entity.username).toBe('alice_mutated');
    expect(event.payload.username).toBe('alice_original');

    await handler.handle(event);

    expect(enqueueWelcomeEmail).toHaveBeenCalledWith({
      userId: user.id,
      username: 'alice_original',
      email: 'alice@example.com',
      tenant: 'tenant_beta',
    });
  });
});
