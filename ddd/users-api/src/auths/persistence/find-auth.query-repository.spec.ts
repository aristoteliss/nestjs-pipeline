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

import type { ICache } from '@nestjs-pipeline/ddd-core';
import type { MikroOrmStore } from '@persistence/mikro-orm.store';
import { describe, expect, it, vi } from 'vitest';
import { FindAuthQuery } from '../cqrs/queries/find-auth.query';
import { Auth } from '../domain/models/auth.entity';
import { FindAuthQueryRepository } from './find-auth.query-repository';

describe('FindAuthQueryRepository', () => {
  it('queries auth by userId and token', async () => {
    const expectedAuth = new Auth({
      userId: 'usr-123',
      token: 'jwt-token-xyz',
    });
    const findOne = vi.fn().mockResolvedValue(expectedAuth);
    const mockStore = {
      get em() {
        return { findOne };
      },
    } as unknown as MikroOrmStore;

    const mockCache = {} as unknown as ICache<Auth>;
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

    const mockCache = {} as unknown as ICache<Auth>;
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
