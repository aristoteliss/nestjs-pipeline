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

    const result = await repository.save(auth);

    expect(upsert).toHaveBeenCalledWith(Auth, auth);
    expect(cache.set).toHaveBeenCalledWith(
      `tenant:auth:id:${auth.id}`,
      result,
    );
    expect(result).toEqual(auth.toJSON());
  });
});
