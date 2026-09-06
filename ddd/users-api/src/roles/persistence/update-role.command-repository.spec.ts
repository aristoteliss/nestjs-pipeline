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

import { NotFoundException } from '@nestjs/common';
import type { ICache } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { UniqueRoleNameException } from '../domain/models/errors/role-name.exception';
import { Role, type RoleSnapshot } from '../domain/models/role.entity';
import { UpdateRoleCommandRepository } from './update-role.command-repository';

describe('UpdateRoleCommandRepository', () => {
  it('updates role and refreshes cache snapshot by id', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    role.rename('publisher');

    const nativeUpdate = vi.fn().mockResolvedValue(1);
    const store = {
      get em() {
        return { nativeUpdate };
      },
    };
    const repository = new UpdateRoleCommandRepository(cache, store as never);

    const result = await repository.save(role);

    expect(nativeUpdate).toHaveBeenCalledWith(
      Role,
      { id: role.id },
      {
        name: 'publisher',
        updatedAt: role.updatedAt,
      },
    );
    expect(cache.set).toHaveBeenCalledWith(`tenant:role:id:${role.id}`, result);
    expect(result).toEqual(role.toJSON());
  });

  it('throws NotFoundException and does not touch cache when affected rows is 0 (concurrent delete)', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    role.rename('publisher');

    const nativeUpdate = vi.fn().mockResolvedValue(0);
    const store = {
      get em() {
        return { nativeUpdate };
      },
    };
    const repository = new UpdateRoleCommandRepository(cache, store as never);

    await expect(repository.save(role)).rejects.toThrow(NotFoundException);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('translates database unique constraint violations into UniqueRoleNameException on rename', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    role.rename('admin');

    const store = {
      get em() {
        return {
          nativeUpdate: vi
            .fn()
            .mockRejectedValue({ code: 'SQLITE_CONSTRAINT_UNIQUE' }),
        };
      },
    };
    const repository = new UpdateRoleCommandRepository(cache, store as never);

    await expect(repository.save(role)).rejects.toThrow(
      UniqueRoleNameException,
    );
  });
});
