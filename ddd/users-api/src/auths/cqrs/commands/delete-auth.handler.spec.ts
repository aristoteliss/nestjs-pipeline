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
import type {
  ICommandRepository,
  IQueryRepository,
} from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { Auth } from '../../domain/models/auth.entity';
import { FindAuthQuery } from '../queries/find-auth.query';
import { DeleteAuthCommand } from './delete-auth.command';
import { DeleteAuthHandler } from './delete-auth.handler';

describe('DeleteAuthHandler', () => {
  it('queries existing auth aggregate and calls command repository save on logout', async () => {
    const existingAuth = Auth.create('usr-123', 'jwt-token-xyz');

    const save = vi.fn().mockResolvedValue(null);
    const mockCommandRepo: ICommandRepository<Auth, null> = { save };

    const find = vi.fn().mockResolvedValue(existingAuth);
    const mockQueryRepo: IQueryRepository<FindAuthQuery, Auth | null> = {
      find,
    };

    const handler = new DeleteAuthHandler(mockCommandRepo, mockQueryRepo);
    const sessionUser: SessionUser = {
      id: 'usr-123',
      tenant: 'tenant_test',
    };
    const command = new DeleteAuthCommand(sessionUser, 'jwt-token-xyz');

    await handler.execute(command);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'usr-123', token: 'jwt-token-xyz' }),
    );
    expect(save).toHaveBeenCalledWith(existingAuth);
  });

  it('safely completes without saving when auth record is not found in query repository', async () => {
    const save = vi.fn().mockResolvedValue(null);
    const mockCommandRepo: ICommandRepository<Auth, null> = { save };

    const find = vi.fn().mockResolvedValue(null);
    const mockQueryRepo: IQueryRepository<FindAuthQuery, Auth | null> = {
      find,
    };

    const handler = new DeleteAuthHandler(mockCommandRepo, mockQueryRepo);
    const sessionUser: SessionUser = {
      id: 'usr-123',
      tenant: 'tenant_test',
    };
    const command = new DeleteAuthCommand(sessionUser, 'expired-token');

    await handler.execute(command);

    expect(find).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('safely completes without error when sessionUser is undefined in command', async () => {
    const save = vi.fn().mockResolvedValue(null);
    const mockCommandRepo: ICommandRepository<Auth, null> = { save };
    const find = vi.fn().mockResolvedValue(null);
    const mockQueryRepo: IQueryRepository<FindAuthQuery, Auth | null> = {
      find,
    };

    const handler = new DeleteAuthHandler(mockCommandRepo, mockQueryRepo);
    const command = new DeleteAuthCommand(undefined);

    await handler.execute(command);

    expect(find).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
