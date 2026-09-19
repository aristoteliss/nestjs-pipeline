/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { type ICache } from '@nestjs-pipeline/ddd-core/application';
import { toCacheSnapshot } from '@nestjs-pipeline/ddd-core/persistence';
import { describe, expect, it, vi } from 'vitest';
import { Auth, type AuthSnapshot } from '../domain/models/auth.entity';
import { CreateAuthCommandRepository } from './create-auth.command-repository';

describe('CreateAuthCommandRepository', () => {
  it('persists auth session aggregate and caches snapshot by id', async () => {
    const cache: ICache<AuthSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const auth = Auth.create('user-1', 'jwt-token-xyz');
    const upsert = vi.fn().mockResolvedValue(auth);
    const store = {
      get em() {
        return { upsert };
      },
    };
    const repository = new CreateAuthCommandRepository(cache, store as never);

    const result = await pipelineStore.run(
      { tenantId: 'tenant' } as unknown as IPipelineContext,
      () => repository.save(auth),
    );

    expect(upsert).toHaveBeenCalledWith(Auth, auth);
    expect(cache.set).toHaveBeenCalledWith(
      `tenant:auth:id:${auth.id}`,
      toCacheSnapshot(result),
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
    expect(result).toEqual(auth.toJSON());
    expect((auth as any)._persistedVersion).toBe(1);
  });
});
