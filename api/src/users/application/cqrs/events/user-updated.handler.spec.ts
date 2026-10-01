/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { UserUpdatedEvent } from '../../../domain/events/user-updated.event.js';
import { User } from '../../../domain/models/user.entity.js';
import type { IUserBatchDispatcher } from '../../ports/user-event-dispatcher.port.js';
import { UserUpdatedHandler } from './user-updated.handler.js';

describe('UserUpdatedHandler', () => {
  it('dispatches only application data; logging/correlation are cross-cutting concerns', async () => {
    const enqueueUserBatch = vi.fn().mockResolvedValue(undefined);
    const dispatcher = { enqueueUserBatch } as IUserBatchDispatcher;
    const handler = new UserUpdatedHandler(dispatcher);

    const user = User.create('john_doe', 'john@example.com');
    user.commit();
    user.update({ username: 'john_renamed' });
    const [event] = user.getUncommittedEvents() as [UserUpdatedEvent];

    await handler.handle(event);

    expect(enqueueUserBatch).toHaveBeenCalledTimes(1);
    expect(enqueueUserBatch).toHaveBeenCalledWith([
      {
        userId: user.id,
        username: 'john_renamed',
      },
    ]);
  });
});
