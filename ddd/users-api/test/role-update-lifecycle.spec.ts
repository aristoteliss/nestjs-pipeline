import { OptimisticLockError } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/libsql';
import type { ICache } from '@nestjs-pipeline/ddd-core';
import { createLibsqlOrmOptions } from '@persistence/libsql-options';
import { Migration20260830000000 } from '@persistence/migrations/Migration20260830000000';
import type { MikroOrmStore } from '@persistence/mikro-orm.store';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { UniqueRoleNameException } from '../src/roles/domain/models/errors/role-name.exception';
import {
  Role,
  type RoleSnapshot,
} from '../src/roles/domain/models/role.entity';
import { UpdateRoleCommandRepository } from '../src/roles/persistence/update-role.command-repository';

describe('versioned role updates with real MikroORM persistence', () => {
  let orm: MikroORM;
  let repository: UpdateRoleCommandRepository;
  const cache: ICache<RoleSnapshot> = {
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
    repository = new UpdateRoleCommandRepository(cache, {
      get em() {
        return orm.em.fork();
      },
    } as MikroOrmStore);
  });
  afterAll(async () => {
    await orm?.close(true);
  });

  it('persists successive versions and rejects an independently loaded stale writer', async () => {
    const original = Role.create('lifecycle-editor');
    await orm.em.fork().upsert(Role, original);
    const first = Role.fromJSON((await repository.findById(original.id))!);
    const stale = Role.fromJSON((await repository.findById(original.id))!);
    first.rename('lifecycle-publisher');
    await repository.save(first);
    first.rename('lifecycle-reviewer');
    await repository.save(first);
    expect(first.getExpectedVersion()).toBe(3);
    stale.rename('lifecycle-stale');
    await expect(repository.save(stale)).rejects.toBeInstanceOf(
      OptimisticLockError,
    );
    expect(stale.getExpectedVersion()).toBe(1);
    expect(await repository.findById(original.id)).toMatchObject({
      name: 'lifecycle-reviewer',
      version: 3,
    });
  });

  it('maps the real driver diagnostic for the role-name unique constraint', async () => {
    const role = Role.create('lifecycle-unique');
    await orm.em.fork().upsert(Role, role);
    role.rename('admin'); // Seeded by the migration.
    await expect(repository.save(role)).rejects.toBeInstanceOf(
      UniqueRoleNameException,
    );
    expect(role.getExpectedVersion()).toBe(1);
    expect(await repository.findById(role.id)).toMatchObject({
      name: 'lifecycle-unique',
      version: 1,
    });
  });

  it('rejects a real outer transaction before writing', async () => {
    const role = Role.create('lifecycle-transaction');
    await orm.em.fork().upsert(Role, role);
    role.rename('lifecycle-uncommitted');
    await orm.em.fork().transactional(async (em) => {
      const transactionalRepository = new UpdateRoleCommandRepository(cache, {
        em,
      } as MikroOrmStore);
      await expect(transactionalRepository.save(role)).rejects.toThrow(
        'external transactions need commit hooks',
      );
    });
    expect(role.getExpectedVersion()).toBe(1);
    expect(await repository.findById(role.id)).toMatchObject({
      name: 'lifecycle-transaction',
      version: 1,
    });
  });
});
