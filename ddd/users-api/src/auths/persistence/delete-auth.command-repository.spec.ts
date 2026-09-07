/* Copyright (C) 2026-present Aristotelis — see repository license. */
import type { ICache } from '@nestjs-pipeline/ddd-core';
import type { MikroOrmStore } from '@persistence/mikro-orm.store';
import { describe, expect, it, vi } from 'vitest';
import { Auth, type AuthSnapshot } from '../domain/models/auth.entity';
import { DeleteAuthCommandRepository } from './delete-auth.command-repository';

describe('DeleteAuthCommandRepository', () => {
  it('deletes rehydrated auth record by primary key id and invalidates cache', async () => {
    const nativeDelete = vi.fn().mockResolvedValue(1);
    const mockStore = {
      get em() {
        return { nativeDelete };
      },
    } as unknown as MikroOrmStore;
    const cacheDelete = vi.fn().mockResolvedValue(undefined);
    const repo = new DeleteAuthCommandRepository(
      { delete: cacheDelete } as unknown as ICache<AuthSnapshot>,
      mockStore,
    );
    const now = new Date();
    const auth = Auth.fromJSON({
      id: '018f2d5e-4b6a-7b3f-8c1d-2e3f4a5b6c7d',
      userId: 'usr-123',
      token: 'jwt-xyz',
      createdAt: now,
      updatedAt: now,
    });

    await expect(repo.save(auth)).resolves.toBeNull();
    expect(nativeDelete).toHaveBeenCalledWith(Auth, { id: auth.id });
    expect(cacheDelete).toHaveBeenCalledWith(
      expect.stringContaining(`auth:id:${auth.id}`),
    );
  });
});
