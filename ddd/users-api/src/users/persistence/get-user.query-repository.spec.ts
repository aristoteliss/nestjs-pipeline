/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import type { ICache } from '@nestjs-pipeline/ddd-core';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';
import { describe, expect, it, vi } from 'vitest';
import { GetUserQuery } from '../cqrs/queries/get-user.query';
import { User, type UserSnapshot } from '../domain/models/user.entity';
import { GetUserQueryRepository } from './get-user.query-repository';

describe('GetUserQueryRepository cache policy', () => {
  it('preserves hydration metadata through global payload validation', async () => {
    const persisted = User.create('Alice', 'alice@example.test', 'engineering');
    const cache: ICache<UserSnapshot> = {
      get: vi.fn().mockResolvedValue(persisted.toJSON()),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const store = { em: { findOne: vi.fn() } };
    const repository = new GetUserQueryRepository(cache, store as never);
    const query = new GetUserQuery({ userId: persisted.id }, { hydrate: true });

    await new ZodValidationBehavior().handle(
      {
        request: query,
        requestType: GetUserQuery,
      } as never,
      async () => undefined,
    );
    const result = await pipelineStore.run(
      { tenantId: 'tenant' } as unknown as IPipelineContext,
      () => repository.find(query),
    );

    expect(query.hydrate).toBe(true);
    expect(result).toBeInstanceOf(User);
    expect(store.em.findOne).not.toHaveBeenCalled();
  });

  it('bypasses cache for a lookup that includes mutable department criteria', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const persisted = User.create('Alice', 'alice@example.test', 'engineering');
    const findOne = vi.fn().mockResolvedValue(persisted);
    const store = {
      get em() {
        return { findOne };
      },
    };
    const repository = new GetUserQueryRepository(cache, store as never);
    const query = new GetUserQuery({
      userId: persisted.id,
      department: 'engineering',
    });

    const result = await repository.find(query);

    expect(result).toBe(persisted);
    expect(findOne).toHaveBeenCalledOnce();
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('caches a serialized snapshot on cache miss instead of live aggregate instance', async () => {
    const persisted = User.create('Charlie', 'charlie@example.test', 'support');
    const cache: ICache<UserSnapshot> = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const store = {
      em: {
        findOne: vi.fn().mockResolvedValue(persisted),
      },
    };
    const repository = new GetUserQueryRepository(cache, store as never);
    const query = new GetUserQuery({ userId: persisted.id });

    const result = await pipelineStore.run(
      { tenantId: 'tenant' } as unknown as IPipelineContext,
      () => repository.find(query),
    );

    expect(result).toBe(persisted);
    expect(cache.set).toHaveBeenCalledWith(
      `tenant:user:id:${persisted.id}`,
      persisted.toJSON(),
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
  });

  it('always hydrates on cache hit into domain entity with Date instances', async () => {
    const persisted = User.create('Dana', 'dana@example.test', 'finance');
    const snapshot = persisted.toJSON();
    const cache: ICache<UserSnapshot> = {
      get: vi.fn().mockResolvedValue(snapshot),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const store = { em: { findOne: vi.fn() } };
    const repository = new GetUserQueryRepository(cache, store as never);
    const query = new GetUserQuery({ userId: persisted.id });

    const result = await pipelineStore.run(
      { tenantId: 'tenant' } as unknown as IPipelineContext,
      () => repository.find(query),
    );

    // With alwaysHydrate: true, cache hit returns hydrated User aggregate
    expect(result).toBeInstanceOf(User);
    expect(result?.id).toBe(persisted.id);
    expect(result?.username).toBe('Dana');
    expect(result?.createdAt).toBeInstanceOf(Date);
    expect(result?.updatedAt).toBeInstanceOf(Date);
  });
});
