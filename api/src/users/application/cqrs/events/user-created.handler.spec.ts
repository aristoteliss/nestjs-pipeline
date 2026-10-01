/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { UserCreatedEvent } from '../../../domain/events/user-created.event.js';
import { User } from '../../../domain/models/user.entity.js';
import type { IWelcomeEmailDispatcher } from '../../ports/user-event-dispatcher.port.js';
import { UserCreatedHandler } from './user-created.handler.js';

describe('UserCreatedHandler', () => {
  it('dispatches only application data; logging/correlation are cross-cutting concerns', async () => {
    const enqueueWelcomeEmail = vi.fn().mockResolvedValue(undefined);
    const dispatcher = { enqueueWelcomeEmail } as IWelcomeEmailDispatcher;
    const handler = new UserCreatedHandler(dispatcher);

    const user = User.create('john_doe', 'john@example.com', 'Engineering');
    const [event] = user.getUncommittedEvents() as [UserCreatedEvent];

    await handler.handle(event);

    expect(enqueueWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(enqueueWelcomeEmail).toHaveBeenCalledWith({
      userId: user.id,
      username: 'john_doe',
      email: 'john@example.com',
    });
  });

  it('isolates handler execution from subsequent in-memory aggregate mutations', async () => {
    const enqueueWelcomeEmail = vi.fn().mockResolvedValue(undefined);
    const dispatcher = { enqueueWelcomeEmail } as IWelcomeEmailDispatcher;
    const handler = new UserCreatedHandler(dispatcher);

    const user = User.create('alice_original', 'alice@example.com');
    const [event] = user.getUncommittedEvents() as [UserCreatedEvent];
    user.update({ username: 'alice_mutated' });

    expect(user.username).toBe('alice_mutated');
    expect('entity' in event).toBe(false);
    expect(event.payload.username).toBe('alice_original');

    await handler.handle(event);

    expect(enqueueWelcomeEmail).toHaveBeenCalledWith({
      userId: user.id,
      username: 'alice_original',
      email: 'alice@example.com',
    });
  });
});
