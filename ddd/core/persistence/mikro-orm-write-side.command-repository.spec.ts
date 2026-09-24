/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { EntityManager } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import { TransientOperationError } from '../domain/exceptions/transient-operation.error';
import type { RootEntitySnapshot } from '../domain/interfaces/root-entity-snapshot.interface';
import { RootEntity } from '../domain/models/root.entity';
import type { ICache } from './cache.interface';
import {
  type IEntityManagerSource,
  MikroOrmWriteSideCommandRepository,
} from './mikro-orm-write-side.command-repository';

interface ItemSnapshot extends Partial<RootEntitySnapshot> {
  name: string;
}

class Item extends RootEntity<ItemSnapshot> {
  readonly name: string;

  constructor(snapshot: Partial<ItemSnapshot>) {
    super(snapshot);
    this.name = snapshot.name ?? 'item';
  }

  get version(): number {
    return this._version;
  }

  toJSON(): RootEntitySnapshot & ItemSnapshot {
    return this.freezeState({
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this._version,
      name: this.name,
    });
  }

  static fromJSON(snapshot: ItemSnapshot): Item {
    return new Item(snapshot);
  }
}

class TestWriteSideRepository extends MikroOrmWriteSideCommandRepository<
  ItemSnapshot,
  Item,
  ItemSnapshot
> {
  async save(_entity: Item): Promise<ItemSnapshot | null> {
    return null;
  }
}

function managerWith(findOne: ReturnType<typeof vi.fn>): EntityManager {
  return { findOne } as unknown as EntityManager;
}

function setup(findOne: ReturnType<typeof vi.fn>) {
  const store: IEntityManagerSource = {
    get em() {
      return managerWith(findOne);
    },
  };
  const cache: ICache<ItemSnapshot> = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };
  const repository = new TestWriteSideRepository(
    cache,
    store,
    Item,
    'Item',
    Item.fromJSON,
  );
  return { cache, repository };
}

describe('MikroOrmWriteSideCommandRepository', () => {
  it('loads authoritative snapshot using refresh: true', async () => {
    const stored = new Item({ name: 'stored', version: 3 });
    const findOne = vi.fn().mockResolvedValue(stored);
    const { cache, repository } = setup(findOne);

    const result = await repository.findById(stored.id);

    expect(findOne).toHaveBeenCalledWith(
      Item,
      { id: stored.id },
      { refresh: true },
    );
    expect(result).toBeInstanceOf(Item);
    expect(result).not.toBe(stored);
    expect(result?.id).toBe(stored.id);
    expect(result?.name).toBe('stored');
    expect(result?.version).toBe(3);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('returns null when aggregate is not found', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const { repository } = setup(findOne);

    const result = await repository.findById('missing-id');

    expect(result).toBeNull();
    expect(findOne).toHaveBeenCalledWith(
      Item,
      { id: 'missing-id' },
      { refresh: true },
    );
  });

  it('translates transient database errors via mapPersistenceError', async () => {
    const failure = {
      code: '08006', // Connection failure in PostgreSQL
      message: 'connection failure',
    };
    const { repository } = setup(vi.fn().mockRejectedValue(failure));

    const error = await repository.findById('err-id').catch((e) => e);

    expect(error).toBeInstanceOf(TransientOperationError);
    expect(error.message).toBe(
      'Transient persistence failure while loading Item err-id.',
    );
    expect(error.cause).toBe(failure);
  });

  it('rethrows a non-transient database error unchanged', async () => {
    const failure = new Error('no such table: item');
    const { repository } = setup(vi.fn().mockRejectedValue(failure));

    await expect(repository.findById('err-id')).rejects.toBe(failure);
  });

  it("reads the store's manager on every call, so each call gets the current one", async () => {
    const first = vi.fn().mockResolvedValue(null);
    const second = vi.fn().mockResolvedValue(null);
    const managers = [managerWith(first), managerWith(second)];
    const store: IEntityManagerSource = {
      get em() {
        return managers.shift() as EntityManager;
      },
    };
    const repository = new TestWriteSideRepository(
      { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
      store,
      Item,
      'Item',
      Item.fromJSON,
    );

    await repository.findById('a');
    await repository.findById('b');

    expect(first).toHaveBeenCalledExactlyOnceWith(
      Item,
      { id: 'a' },
      { refresh: true },
    );
    expect(second).toHaveBeenCalledExactlyOnceWith(
      Item,
      { id: 'b' },
      { refresh: true },
    );
  });
});
