/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ICache } from '@nestjs-pipeline/ddd-core/application';
import type { MikroOrmStore } from '@persistence/mikro-orm.store';
import { describe, expect, it, vi } from 'vitest';
import { FindAuthQuery } from '../cqrs/queries/find-auth.query';
import { Auth, type AuthSnapshot } from '../domain/models/auth.entity';
import { FindAuthQueryRepository } from './find-auth.query-repository';

describe('FindAuthQueryRepository', () => {
  it('queries auth by userId and token', async () => {
    const expectedAuth = Auth.create('usr-123', 'jwt-token-xyz');
    const findOne = vi.fn().mockResolvedValue(expectedAuth);
    const mockStore = {
      get em() {
        return { findOne };
      },
    } as unknown as MikroOrmStore;

    const mockCache = {} as unknown as ICache<AuthSnapshot>;
    const repo = new FindAuthQueryRepository(mockCache, mockStore);

    const query = new FindAuthQuery({
      userId: 'usr-123',
      token: 'jwt-token-xyz',
    });

    const result = await repo.find(query);

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

    const mockCache = {} as unknown as ICache<AuthSnapshot>;
    const repo = new FindAuthQueryRepository(mockCache, mockStore);

    const query = new FindAuthQuery({
      userId: 'usr-deleted',
      token: 'some-token',
    });

    const result = await repo.find(query);

    expect(result).toBeNull();
    expect(findOne).toHaveBeenCalledWith(Auth, {
      userId: 'usr-deleted',
      token: 'some-token',
    });
  });
});
