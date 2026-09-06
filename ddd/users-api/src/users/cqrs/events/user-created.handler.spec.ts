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
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { UserCreatedEvent } from '../../domain/events/user-created.event';
import { User } from '../../domain/models/user.entity';
import type { WelcomeEmailJobData } from '../../jobs/send-welcome-email.processor';
import { UserCreatedHandler } from './user-created.handler';

describe('UserCreatedHandler', () => {
  it('reads user details from immutable event.payload and enqueues welcome email', async () => {
    const queueAddMock = vi.fn().mockResolvedValue({ id: 'job-1' });
    const mockQueue = {
      add: queueAddMock,
    } as unknown as Queue<WelcomeEmailJobData>;

    const tenantContext = {
      schema: 'tenant_alpha',
    } as unknown as TenantSchemaContext;

    const handler = new UserCreatedHandler(mockQueue, tenantContext);

    const user = User.create('john_doe', 'john@example.com', 'Engineering');
    const [event] = user.getUncommittedEvents() as [UserCreatedEvent];

    await handler.handle(event);

    expect(queueAddMock).toHaveBeenCalledTimes(1);
    expect(queueAddMock).toHaveBeenCalledWith(
      'send',
      expect.objectContaining({
        userId: user.id,
        username: 'john_doe',
        email: 'john@example.com',
        tenant: 'tenant_alpha',
      }),
    );
  });

  it('isolates handler execution from subsequent in-memory aggregate mutations', async () => {
    const queueAddMock = vi.fn().mockResolvedValue({ id: 'job-2' });
    const mockQueue = {
      add: queueAddMock,
    } as unknown as Queue<WelcomeEmailJobData>;

    const tenantContext = {
      schema: 'tenant_beta',
    } as unknown as TenantSchemaContext;

    const handler = new UserCreatedHandler(mockQueue, tenantContext);

    const user = User.create('alice_original', 'alice@example.com');
    const [event] = user.getUncommittedEvents() as [UserCreatedEvent];

    // Mutate the aggregate entity after event generation
    user.update({ username: 'alice_mutated' });

    // The entity has mutated username
    expect(user.username).toBe('alice_mutated');
    expect(event.entity.username).toBe('alice_mutated');

    // But event.payload must retain the immutable snapshot at creation time
    expect(event.payload.username).toBe('alice_original');

    await handler.handle(event);

    expect(queueAddMock).toHaveBeenCalledWith(
      'send',
      expect.objectContaining({
        userId: user.id,
        username: 'alice_original',
        email: 'alice@example.com',
        tenant: 'tenant_beta',
      }),
    );
  });
});
