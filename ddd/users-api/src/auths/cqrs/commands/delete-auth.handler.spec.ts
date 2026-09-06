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

import type { SessionUser } from '@common/types/SessionUser';
import type { ICommandRepository } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { Auth } from '../../domain/models/auth.entity';
import { DeleteAuthCommand } from './delete-auth.command';
import { DeleteAuthHandler } from './delete-auth.handler';

describe('DeleteAuthHandler', () => {
  it('calls command repository save to revoke persistent auth on logout', async () => {
    const save = vi.fn().mockResolvedValue(null);
    const mockRepo: ICommandRepository<Auth, null> = {
      save,
    };

    const handler = new DeleteAuthHandler(mockRepo);
    const sessionUser: SessionUser = {
      id: 'usr-123',
      tenant: 'tenant_test',
    };
    const command = new DeleteAuthCommand(sessionUser);

    await handler.execute(command);

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'usr-123' }),
    );
  });

  it('safely completes without error when sessionUser is undefined in command', async () => {
    const save = vi.fn().mockResolvedValue(null);
    const mockRepo: ICommandRepository<Auth, null> = {
      save,
    };

    const handler = new DeleteAuthHandler(mockRepo);
    const command = new DeleteAuthCommand(undefined);

    await handler.execute(command);

    expect(save).not.toHaveBeenCalled();
  });
});
