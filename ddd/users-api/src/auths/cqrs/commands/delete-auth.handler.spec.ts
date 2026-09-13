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
    const command = new DeleteAuthCommand({
      userId: 'usr-123',
      token: 'jwt-token-xyz',
    });

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
    const command = new DeleteAuthCommand({
      userId: 'usr-123',
      token: 'expired-token',
    });

    await handler.execute(command);

    expect(find).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('throws validation error when userId or token is missing in command payload', () => {
    expect(() => new DeleteAuthCommand({} as any)).toThrow();
    expect(() => new DeleteAuthCommand({ userId: 'usr-1' } as any)).toThrow();
    expect(() => new DeleteAuthCommand({ token: 'tok-1' } as any)).toThrow();
  });

  it('deletes auth record when userId and token are passed in command payload', async () => {
    const existingAuth = Auth.create('usr-456', 'jwt-token-direct');
    const save = vi.fn().mockResolvedValue(null);
    const mockCommandRepo: ICommandRepository<Auth, null> = { save };
    const find = vi.fn().mockResolvedValue(existingAuth);
    const mockQueryRepo: IQueryRepository<FindAuthQuery, Auth | null> = {
      find,
    };

    const handler = new DeleteAuthHandler(mockCommandRepo, mockQueryRepo);
    const command = new DeleteAuthCommand({
      userId: 'usr-456',
      token: 'jwt-token-direct',
    });

    expect(command.userId).toBe('usr-456');
    expect(command.token).toBe('jwt-token-direct');

    await handler.execute(command);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'usr-456', token: 'jwt-token-direct' }),
    );
    expect(save).toHaveBeenCalledWith(existingAuth);
  });
});
