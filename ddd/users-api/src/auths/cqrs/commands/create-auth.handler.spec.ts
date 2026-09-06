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

import type { EventBus } from '@nestjs/cqrs';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { describe, expect, it, vi } from 'vitest';
import { CreatedAuthEvent } from '../../domain/events/create-auth.event';
import { Auth } from '../../domain/models/auth.entity';
import { CreateAuthCommand } from './create-auth.command';
import { CreateAuthHandler } from './create-auth.handler';

describe('CreateAuthHandler', () => {
  it('authenticates, signs token, persists Auth entity, and publishes event via this.commit(auth)', async () => {
    const eventBus = {
      publishAll: vi.fn(),
    } as unknown as EventBus;

    const userLoginService = {
      authenticate: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'alice@example.test',
        department: 'Engineering',
      }),
      signToken: vi.fn().mockResolvedValue({
        userId: 'user-1',
        accessToken: 'signed-token-123',
        userCapabilities: { roles: ['admin'], additionalCapabilities: [], deniedCapabilities: [] },
      }),
    };

    const save = vi.fn().mockResolvedValue({ id: 'auth-id' });
    const commandRepository = { save };
    const tenantSchemaContext = { schema: 'tenant_alpha' } as TenantSchemaContext;

    const handler = new CreateAuthHandler(
      eventBus,
      userLoginService as never,
      commandRepository as never,
      tenantSchemaContext,
    );

    const command = new CreateAuthCommand({
      email: 'alice@example.test',
      code: '123456',
    });

    const result = await handler.execute(command);

    expect(userLoginService.authenticate).toHaveBeenCalledWith('alice@example.test', '123456');
    expect(userLoginService.signToken).toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(expect.any(Auth));

    const savedAuth = save.mock.calls[0][0] as Auth;
    expect(savedAuth.userId).toBe('user-1');
    expect(savedAuth.token).toBe('signed-token-123');

    // Verify this.commit(auth) published CreatedAuthEvent and uncommitted
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
    expect(eventBus.publishAll).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(CreatedAuthEvent)]),
    );
    expect(savedAuth.getUncommittedEvents()).toHaveLength(0);

    expect(result).toEqual({
      id: 'user-1',
      tenant: 'tenant_alpha',
      email: 'alice@example.test',
      department: 'Engineering',
      capabilities: { roles: ['admin'], additionalCapabilities: [], deniedCapabilities: [] },
      token: 'signed-token-123',
    });
  });
});
