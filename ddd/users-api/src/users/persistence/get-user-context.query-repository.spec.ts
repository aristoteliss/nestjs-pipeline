/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { describe, expect, it, vi } from 'vitest';
import { GetUserContextQuery } from '../cqrs/queries/get-user-context.query';
import { User } from '../domain/models/user.entity';
import { GetUserContextQueryRepository } from './get-user-context.query-repository';

describe('GetUserContextQueryRepository', () => {
  it('reads current authorization context from persistence on every lookup', async () => {
    const user = User.create('Alice', 'alice@example.test', 'engineering');
    const findOne = vi.fn().mockResolvedValue(user);
    const repository = new GetUserContextQueryRepository({
      get em() {
        return { findOne };
      },
    } as never);
    const query = new GetUserContextQuery({ userId: user.id });

    const first = await repository.find(query);
    const second = await repository.find(query);

    expect(findOne).toHaveBeenCalledTimes(2);
    expect(findOne).toHaveBeenCalledWith(User, { id: user.id });
    expect(first).toEqual({
      id: user.id,
      department: 'engineering',
    });
    expect(second).toEqual({
      id: user.id,
      department: 'engineering',
    });
  });

  it('returns null when the persisted user no longer exists', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const repository = new GetUserContextQueryRepository({
      get em() {
        return { findOne };
      },
    } as never);

    await expect(
      repository.find(
        new GetUserContextQuery({
          userId: '019de10c-b680-7000-8000-000000000099',
        }),
      ),
    ).resolves.toBeNull();
  });
});
