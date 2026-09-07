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
import type { IWelcomeEmailDispatcher } from '../../application/ports/user-event-dispatcher.port';
import { UserCreatedEvent } from '../../domain/events/user-created.event';
import { User } from '../../domain/models/user.entity';
import { UserCreatedHandler } from './user-created.handler';

describe('UserCreatedHandler', () => {
  it('reads immutable event.payload and dispatches the welcome-email application intent', async () => {
    const enqueueWelcomeEmail = vi.fn().mockResolvedValue(undefined);
    const dispatcher = { enqueueWelcomeEmail } as IWelcomeEmailDispatcher;
    const tenantContext = {
      schema: 'tenant_alpha',
    } as unknown as TenantSchemaContext;
    const handler = new UserCreatedHandler(dispatcher, tenantContext);

    const user = User.create('john_doe', 'john@example.com', 'Engineering');
    const [event] = user.getUncommittedEvents() as [UserCreatedEvent];

    await handler.handle(event);

    expect(enqueueWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(enqueueWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        username: 'john_doe',
        email: 'john@example.com',
        tenant: 'tenant_alpha',
        correlationId: expect.any(String),
      }),
    );
  });

  it('isolates handler execution from subsequent in-memory aggregate mutations', async () => {
    const enqueueWelcomeEmail = vi.fn().mockResolvedValue(undefined);
    const dispatcher = { enqueueWelcomeEmail } as IWelcomeEmailDispatcher;
    const tenantContext = {
      schema: 'tenant_beta',
    } as unknown as TenantSchemaContext;
    const handler = new UserCreatedHandler(dispatcher, tenantContext);

    const user = User.create('alice_original', 'alice@example.com');
    const [event] = user.getUncommittedEvents() as [UserCreatedEvent];
    user.update({ username: 'alice_mutated' });

    expect(user.username).toBe('alice_mutated');
    expect(event.entity.username).toBe('alice_mutated');
    expect(event.payload.username).toBe('alice_original');

    await handler.handle(event);

    expect(enqueueWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        username: 'alice_original',
        email: 'alice@example.com',
        tenant: 'tenant_beta',
      }),
    );
  });
});
