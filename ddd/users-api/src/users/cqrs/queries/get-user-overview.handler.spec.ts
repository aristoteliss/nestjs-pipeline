/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import { User } from '../../domain/models/user.entity';
import {
  GetUserOverviewHandler,
  userOverviewCacheKey,
} from './get-user-overview.handler';
import { GetUserOverviewQuery } from './get-user-overview.query';

describe('GetUserOverviewHandler', () => {
  it('composes user profile and capabilities into a single read model', async () => {
    const user = User.create('Bob', 'bob@example.test', 'engineering');
    const mockUserRepo = {
      find: vi.fn().mockResolvedValue(user),
    };
    const mockCapabilitiesRepo = {
      find: vi.fn().mockResolvedValue({
        roles: ['developer', 'operator'],
        additionalCapabilities: ['deploy:staging'],
      }),
    };

    const handler = new GetUserOverviewHandler(
      mockUserRepo as never,
      mockCapabilitiesRepo as never,
    );

    const query = new GetUserOverviewQuery({ userId: user.id });
    const result = await handler.execute(query);

    expect(result).toEqual({
      id: user.id,
      username: 'Bob',
      email: 'bob@example.test',
      department: 'engineering',
      roles: ['developer', 'operator'],
      capabilities: ['deploy:staging'],
    });
    expect(mockUserRepo.find).toHaveBeenCalled();
    expect(mockCapabilitiesRepo.find).toHaveBeenCalled();
  });

  it('returns null when the user does not exist', async () => {
    const mockUserRepo = {
      find: vi.fn().mockResolvedValue(null),
    };
    const mockCapabilitiesRepo = {
      find: vi.fn(),
    };

    const handler = new GetUserOverviewHandler(
      mockUserRepo as never,
      mockCapabilitiesRepo as never,
    );

    const missingUserId = '018f2d5e-4b6a-7b3f-8c1d-2e3f4a5b6c7d';
    const query = new GetUserOverviewQuery({ userId: missingUserId });
    const result = await handler.execute(query);

    expect(result).toBeNull();
    expect(mockCapabilitiesRepo.find).not.toHaveBeenCalled();
  });

  it('derives a partitioned cache key scoped by tenant, principal, permission scope, and payload', () => {
    const query = new GetUserOverviewQuery({ userId: 'u-123' });
    const items = new Map<string, unknown>([
      [
        'user',
        {
          id: 'principal-42',
          capabilities: {
            roles: ['admin', 'billing'],
          },
        },
      ],
    ]);

    const context: Partial<IPipelineContext> = {
      tenantId: 'tenant-omega',
      request: query,
      items,
    };

    const key = userOverviewCacheKey(context as IPipelineContext);
    expect(key).toContain('tenant-omega');
    expect(key).toContain('principal-42');
  });
});
