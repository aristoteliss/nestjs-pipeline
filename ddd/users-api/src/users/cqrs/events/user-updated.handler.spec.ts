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

import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import type { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { UserUpdatedHandler } from './user-updated.handler';
import { User } from '../../domain/models/user.entity';
import { UserUpdatedEvent } from '../../domain/events/user-updated.event';
import type { BatchUpdateUserItem } from '../../jobs/batch-update-users.processor';

describe('UserUpdatedHandler', () => {
  it('reads user details from immutable event.payload and enqueues batch update', async () => {
    const queueAddMock = vi.fn().mockResolvedValue({ id: 'job-update-1' });
    const mockQueue = {
      add: queueAddMock,
    } as unknown as Queue<BatchUpdateUserItem[]>;

    const tenantContext = {
      schema: 'tenant_gamma',
    } as unknown as TenantSchemaContext;

    const handler = new UserUpdatedHandler(mockQueue, tenantContext);

    const user = User.create('john_doe', 'john@example.com');
    user.commit();

    user.update({ username: 'john_renamed' });
    const [event] = user.getUncommittedEvents() as [UserUpdatedEvent];

    await handler.handle(event);

    expect(queueAddMock).toHaveBeenCalledTimes(1);
    expect(queueAddMock).toHaveBeenCalledWith(
      'batch-update',
      [
        {
          userId: user.id,
          username: 'john_renamed',
          tenant: 'tenant_gamma',
        },
      ],
      expect.anything(),
    );
  });
});
