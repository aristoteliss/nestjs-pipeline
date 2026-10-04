/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type ICache } from '@cqrs-ddd/core/application';
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';
import { describe, expect, it, vi } from 'vitest';
import { Auth, type AuthSnapshot } from '../domain/models/auth.entity.js';
import { CreateAuthCommandRepository } from './create-auth.command-repository.js';

describe('CreateAuthCommandRepository', () => {
  it('inserts the session without writing it or its refresh-token hash to the cache', async () => {
    const cache: ICache<AuthSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const auth = Auth.create(
      '019488e0-0000-7000-8000-000000000001',
      'refresh-hash',
      Date.now() + 1000,
    );
    const insert = vi.fn().mockResolvedValue(auth.id);
    const store = {
      get em() {
        return { insert };
      },
    };
    const repository = new CreateAuthCommandRepository(cache, store as never);

    const result = await runWithTenant('tenant', () => repository.save(auth));

    expect(insert).toHaveBeenCalledWith(Auth, auth);
    expect(result).toEqual(auth.toJSON());
    expect(cache.set).not.toHaveBeenCalled();
    expect(auth.getExpectedVersion()).toBe(1);
  });
});
