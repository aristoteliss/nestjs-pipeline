/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { type ICache } from '@nestjs-pipeline/ddd-core/application';
import { DEFAULT_BARRIER_TTL_MS } from '@nestjs-pipeline/ddd-core/persistence';
import type { MikroOrmStore } from '@persistence/mikro-orm.store';
import { describe, expect, it, vi } from 'vitest';
import { Auth, type AuthSnapshot } from '../domain/models/auth.entity';
import { DeleteAuthCommandRepository } from './delete-auth.command-repository';

describe('DeleteAuthCommandRepository', () => {
  it('deletes auth record by primary key id and invalidates cache', async () => {
    const nativeDelete = vi.fn().mockResolvedValue(1);
    const mockStore = {
      get em() {
        return { nativeDelete };
      },
    } as unknown as MikroOrmStore;

    const cacheSet = vi.fn().mockResolvedValue(undefined);
    const mockCache = {
      set: cacheSet,
      delete: vi.fn(),
    } as unknown as ICache<AuthSnapshot>;

    const repo = new DeleteAuthCommandRepository(mockCache, mockStore);
    const now = new Date();
    const auth = Auth.fromJSON({
      id: '018f2d5e-4b6a-7b3f-8c1d-2e3f4a5b6c7d',
      userId: 'usr-123',
      token: 'jwt-xyz',
      createdAt: now,
      updatedAt: now,
    });

    const result = await pipelineStore.run(
      { tenantId: 'tenant' } as unknown as IPipelineContext,
      () => repo.save(auth),
    );

    expect(result).toBeNull();
    expect(nativeDelete).toHaveBeenCalledWith(Auth, {
      id: '018f2d5e-4b6a-7b3f-8c1d-2e3f4a5b6c7d',
    });
    expect(cacheSet).toHaveBeenCalledWith(
      expect.stringContaining(`auth:id:${auth.id}`),
      expect.objectContaining({
        __cacheBarrier: true,
        reason: 'deleted',
      }),
      { ttl: DEFAULT_BARRIER_TTL_MS },
    );
  });
});
