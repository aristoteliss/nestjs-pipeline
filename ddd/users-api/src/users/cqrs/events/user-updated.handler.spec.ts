/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import type { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { describe, expect, it, vi } from 'vitest';
import type { IUserBatchDispatcher } from '../../application/ports/user-event-dispatcher.port';
import { UserUpdatedEvent } from '../../domain/events/user-updated.event';
import { User } from '../../domain/models/user.entity';
import { UserUpdatedHandler } from './user-updated.handler';

describe('UserUpdatedHandler', () => {
  it('reads immutable event.payload and dispatches batch work through the application port', async () => {
    const enqueueUserBatch = vi.fn().mockResolvedValue(undefined);
    const dispatcher = { enqueueUserBatch } as IUserBatchDispatcher;
    const tenantContext = {
      schema: 'tenant_gamma',
    } as unknown as TenantSchemaContext;
    const handler = new UserUpdatedHandler(dispatcher, tenantContext);

    const user = User.create('john_doe', 'john@example.com');
    user.commit();
    user.update({ username: 'john_renamed' });
    const [event] = user.getUncommittedEvents() as [UserUpdatedEvent];

    await handler.handle(event);

    expect(enqueueUserBatch).toHaveBeenCalledTimes(1);
    expect(enqueueUserBatch).toHaveBeenCalledWith(
      [
        {
          userId: user.id,
          username: 'john_renamed',
          tenant: 'tenant_gamma',
        },
      ],
      expect.any(String),
    );
  });
});
