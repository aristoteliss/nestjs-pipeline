/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MikroORM } from '@mikro-orm/libsql';
import type { ICache } from '@nestjs-pipeline/ddd-core/application';
import { ConcurrencyConflictError } from '@nestjs-pipeline/ddd-core/domain';
import { createLibsqlOrmOptions } from '@persistence/libsql-options';
import { Migration20260830000000 } from '@persistence/migrations/Migration20260830000000';
import type { MikroOrmStore } from '@persistence/mikro-orm.store';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  User,
  type UserSnapshot,
} from '../src/users/domain/models/user.entity';
import { UpdateUserCommandRepository } from '../src/users/persistence/update-user.command-repository';

describe('versioned user updates with real MikroORM persistence', () => {
  let orm: MikroORM;
  let repository: UpdateUserCommandRepository;
  const cache: ICache<UserSnapshot> = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...createLibsqlOrmOptions(':memory:'),
      debug: false,
      migrations: {
        migrationsList: [Migration20260830000000],
        snapshot: false,
      },
    });
    await orm.migrator.up();
    repository = new UpdateUserCommandRepository(cache, {
      get em() {
        return orm.em.fork();
      },
    } as MikroOrmStore);
  });

  afterAll(async () => {
    await orm?.close(true);
  });

  it('persists successive versions and rejects an independently loaded stale writer', async () => {
    const original = User.create(
      'lifecycle-alice',
      'alice-life@acme.test',
      'engineering',
    );
    await orm.em.fork().upsert(User, original);

    const first = User.fromJSON((await repository.findById(original.id))!);
    const stale = User.fromJSON((await repository.findById(original.id))!);

    first.update({ username: 'alice-updated-1' });
    await repository.save(first);

    first.update({ username: 'alice-updated-2' });
    await repository.save(first);

    expect(first.getExpectedVersion()).toBe(3);

    stale.update({ username: 'alice-stale' });
    await expect(repository.save(stale)).rejects.toBeInstanceOf(
      ConcurrencyConflictError,
    );
    expect(stale.getExpectedVersion()).toBe(1);

    expect(await repository.findById(original.id)).toMatchObject({
      username: 'alice-updated-2',
      version: 3,
    });
  });

  it('rejects a real outer transaction before writing', async () => {
    const user = User.create('lifecycle-tx', 'tx-life@acme.test');
    await orm.em.fork().upsert(User, user);
    user.update({ username: 'tx-uncommitted' });

    await orm.em.fork().transactional(async (em) => {
      const transactionalRepository = new UpdateUserCommandRepository(cache, {
        em,
      } as MikroOrmStore);
      await expect(transactionalRepository.save(user)).rejects.toThrow(
        'external transactions need commit hooks',
      );
    });

    expect(user.getExpectedVersion()).toBe(1);
    expect(await repository.findById(user.id)).toMatchObject({
      username: 'lifecycle-tx',
      version: 1,
    });
  });
});
