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
import { UniqueRoleNameException } from '../domain/models/errors/role-name.exception';
import { Role, type RoleSnapshot } from '../domain/models/role.entity';
import { CreateRoleCommandRepository } from './create-role.command-repository';

describe('CreateRoleCommandRepository', () => {
  it('persists role and caches snapshot by id', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    const upsert = vi.fn().mockResolvedValue(role);
    const store = {
      get em() {
        return { upsert };
      },
    };
    const repository = new CreateRoleCommandRepository(cache, store as never);

    const result = await repository.save(role);

    expect(upsert).toHaveBeenCalledWith(Role, role);
    expect(cache.set).toHaveBeenCalledWith(
      `tenant:role:id:${role.id}`,
      result,
    );
    expect(result).toEqual(role.toJSON());
  });

  it('translates database unique constraint violations into UniqueRoleNameException', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    const store = {
      get em() {
        return {
          upsert: vi
            .fn()
            .mockRejectedValue({ code: 'SQLITE_CONSTRAINT_UNIQUE' }),
        };
      },
    };
    const repository = new CreateRoleCommandRepository(cache, store as never);

    await expect(repository.save(role)).rejects.toThrow(UniqueRoleNameException);
  });
});
