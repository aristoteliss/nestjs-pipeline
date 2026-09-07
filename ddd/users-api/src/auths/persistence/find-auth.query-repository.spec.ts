/* Copyright (C) 2026-present Aristotelis — see repository license. */
import type { ICache } from '@nestjs-pipeline/ddd-core';
import type { MikroOrmStore } from '@persistence/mikro-orm.store';
import { describe, expect, it, vi } from 'vitest';
import { FindAuthQuery } from '../cqrs/queries/find-auth.query';
import { Auth } from '../domain/models/auth.entity';
import { FindAuthQueryRepository } from './find-auth.query-repository';

describe('FindAuthQueryRepository', () => {
  it('queries auth by userId and token', async () => {
    const expectedAuth = Auth.fromJSON({
      id: '018f2d5e-4b6a-7b3f-8c1d-2e3f4a5b6c7d',
      userId: 'usr-123',
      token: 'jwt-token-xyz',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const findOne = vi.fn().mockResolvedValue(expectedAuth);
    const mockStore = {
      get em() {
        return { findOne };
      },
    } as unknown as MikroOrmStore;

    const repo = new FindAuthQueryRepository({} as ICache<Auth>, mockStore);
    const result = await repo.find(
      new FindAuthQuery({ userId: 'usr-123', token: 'jwt-token-xyz' }),
    );

    expect(result).toBe(expectedAuth);
    expect(findOne).toHaveBeenCalledWith(Auth, {
      userId: 'usr-123',
      token: 'jwt-token-xyz',
    });
  });

  it('returns null when no active auth record exists', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const mockStore = {
      get em() {
        return { findOne };
      },
    } as unknown as MikroOrmStore;
    const repo = new FindAuthQueryRepository({} as ICache<Auth>, mockStore);

    await expect(
      repo.find(
        new FindAuthQuery({ userId: 'usr-deleted', token: 'some-token' }),
      ),
    ).resolves.toBeNull();
  });
});
