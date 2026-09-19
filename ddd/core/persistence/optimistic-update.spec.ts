/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type EntityManager } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import { ConcurrencyConflictError } from '../domain/exceptions/concurrency-conflict.error';
import { EntityNotFoundException } from '../domain/exceptions/entity-not-found.exception';
import { optimisticUpdate } from './optimistic-update';

class Item {
  id = 'item-1';
  version = 4;
  getExpectedVersion() {
    return 2;
  }
  acknowledgePersisted = vi.fn();
}
function setup() {
  const entity = new Item();
  const manager = {
    isInTransaction: vi.fn().mockReturnValue(false),
    nativeUpdate: vi.fn().mockResolvedValue(1),
    findOne: vi.fn(),
  };
  const save = (data = {}) =>
    optimisticUpdate(
      manager as unknown as EntityManager,
      Item,
      entity,
      data,
      'Item',
    );
  return { entity, manager, save };
}

describe('optimisticUpdate', () => {
  it('uses the persisted baseline in WHERE, current version in SET, and leaves acknowledgment to the caller', async () => {
    const { entity, manager, save } = setup();
    const data = { version: 999 };
    await expect(save(data)).resolves.toBeUndefined();
    expect(manager.nativeUpdate).toHaveBeenCalledExactlyOnceWith(
      Item,
      { id: 'item-1', version: 2 },
      { version: 4 },
    );
    expect(data).toEqual({ version: 999 });
    expect(manager.findOne).not.toHaveBeenCalled();
    expect(entity.acknowledgePersisted).not.toHaveBeenCalled();
  });

  it('distinguishes deletion from version mismatch after zero affected rows', async () => {
    const { manager, save } = setup();
    manager.nativeUpdate.mockResolvedValue(0);
    manager.findOne.mockResolvedValue(null);
    await expect(save()).rejects.toBeInstanceOf(EntityNotFoundException);
    expect(manager.findOne).toHaveBeenCalledWith(
      Item,
      { id: 'item-1' },
      { refresh: true },
    );
    manager.findOne.mockResolvedValue({ version: 5 });
    await expect(save()).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it('retains the original lookup id and expected version across an asynchronous write', async () => {
    const { entity, manager, save } = setup();
    manager.nativeUpdate.mockImplementation(async () => {
      entity.id = 'changed';
      entity.version = 8;
      return 0;
    });
    manager.findOne.mockResolvedValue(null);
    await expect(save()).rejects.toBeInstanceOf(EntityNotFoundException);
    expect(manager.findOne).toHaveBeenCalledWith(
      Item,
      { id: 'item-1' },
      { refresh: true },
    );
    expect(manager.nativeUpdate.mock.calls[0][1]).toEqual({
      id: 'item-1',
      version: 2,
    });
  });

  it('rejects active transactions before issuing SQL', async () => {
    const { entity, manager, save } = setup();
    manager.isInTransaction.mockReturnValue(true);
    await expect(save()).rejects.toThrow(
      'external transactions need commit hooks',
    );
    expect(manager.nativeUpdate).not.toHaveBeenCalled();
    expect(manager.findOne).not.toHaveBeenCalled();
    expect(entity.acknowledgePersisted).not.toHaveBeenCalled();
  });

  it('preserves write failures without performing diagnostic reads', async () => {
    const { manager, save } = setup();
    const failure = { code: '23505', constraint: 'item_name_unique' };
    manager.nativeUpdate.mockRejectedValue(failure);
    await expect(save()).rejects.toBe(failure);
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  it('preserves a failed diagnostic read instead of reporting an invented conflict', async () => {
    const { manager, save } = setup();
    const failure = new Error('connection lost');
    manager.nativeUpdate.mockResolvedValue(0);
    manager.findOne.mockRejectedValue(failure);
    await expect(save()).rejects.toBe(failure);
  });

  it.each([-1, 2])(
    'rejects an unexpected affected-row count: %s',
    async (count) => {
      const { entity, manager, save } = setup();
      manager.nativeUpdate.mockResolvedValue(count);
      await expect(save()).rejects.toThrow(
        `Expected one updated Item, received ${count}`,
      );
      expect(manager.findOne).not.toHaveBeenCalled();
      expect(entity.acknowledgePersisted).not.toHaveBeenCalled();
    },
  );
});
