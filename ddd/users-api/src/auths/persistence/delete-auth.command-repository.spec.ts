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

    const cacheDelete = vi.fn().mockResolvedValue(undefined);
    const mockCache = {
      delete: cacheDelete,
    } as unknown as ICache<AuthSnapshot>;

    const repo = new DeleteAuthCommandRepository(mockCache, mockStore);
    const now = new Date();
    const auth = new Auth({
      id: '018f2d5e-4b6a-7b3f-8c1d-2e3f4a5b6c7d',
      userId: 'usr-123',
      token: 'jwt-xyz',
      createdAt: now,
      updatedAt: now,
    });

    const result = await repo.save(auth);

    expect(result).toBeNull();
    expect(nativeDelete).toHaveBeenCalledWith(Auth, {
      id: '018f2d5e-4b6a-7b3f-8c1d-2e3f4a5b6c7d',
    });
    expect(cacheDelete).toHaveBeenCalledWith(
      expect.stringContaining(`auth:id:${auth.id}`),
    );
  });
});
