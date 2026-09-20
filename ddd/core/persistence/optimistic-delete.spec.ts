/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { EntityManager } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import { ConcurrencyConflictError } from '../domain/exceptions/concurrency-conflict.error';
import { EntityNotFoundException } from '../domain/exceptions/entity-not-found.exception';
import { assertAutocommit } from './assert-autocommit';
import { optimisticDelete } from './optimistic-delete';

class Item {
  id = 'item-1';
  version = 4;
  getExpectedVersion() {
    return 2;
  }
  acknowledgePersisted = vi.fn();
}

function setup(affected = 1) {
  const aggregate = new Item();
  const manager = {
    isInTransaction: vi.fn().mockReturnValue(false),
    nativeDelete: vi.fn().mockResolvedValue(affected),
    findOne: vi.fn().mockResolvedValue(null),
  };
  const remove = () =>
    optimisticDelete(
      manager as unknown as EntityManager,
      Item,
      aggregate,
      'Item',
    );
  return { aggregate, manager, remove };
}

describe('optimisticDelete', () => {
  it('conditions the delete on the persisted version baseline', async () => {
    const { manager, remove } = setup();

    await expect(remove()).resolves.toBeUndefined();

    expect(manager.nativeDelete).toHaveBeenCalledExactlyOnceWith(Item, {
      id: 'item-1',
      version: 2,
    });
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  it('leaves acknowledgment to the caller', async () => {
    const { aggregate, remove } = setup();

    await remove();

    expect(aggregate.acknowledgePersisted).not.toHaveBeenCalled();
  });

  it('reports a missing row as not found', async () => {
    const { manager, remove } = setup(0);

    await expect(remove()).rejects.toThrow(EntityNotFoundException);
    expect(manager.findOne).toHaveBeenCalledExactlyOnceWith(
      Item,
      { id: 'item-1' },
      { refresh: true },
    );
  });

  it('reports a diverged version as a concurrency conflict', async () => {
    const { manager, remove } = setup(0);
    manager.findOne.mockResolvedValue({ id: 'item-1', version: 7 });

    await expect(remove()).rejects.toMatchObject({
      name: ConcurrencyConflictError.name,
      expectedVersion: 2,
      actualVersion: 7,
    });
  });

  it('rejects an externally active transaction before deleting anything', async () => {
    const { manager, remove } = setup();
    manager.isInTransaction.mockReturnValue(true);

    await expect(remove()).rejects.toThrow(/requires autocommit/);
    expect(manager.nativeDelete).not.toHaveBeenCalled();
  });

  it('treats an unexpected affected-row count as an invariant violation', async () => {
    const { remove } = setup(2);

    await expect(remove()).rejects.toThrow(
      'Expected one deleted Item, received 2.',
    );
  });

  it('uses the entity manager it was given for both statements', async () => {
    const { manager, remove } = setup(0);

    await expect(remove()).rejects.toThrow(EntityNotFoundException);

    expect(manager.nativeDelete).toHaveBeenCalledTimes(1);
    expect(manager.findOne).toHaveBeenCalledTimes(1);
  });
});

describe('assertAutocommit', () => {
  it('passes outside a transaction', () => {
    const em = { isInTransaction: () => false } as unknown as EntityManager;

    expect(() => assertAutocommit(em, 'writeThing')).not.toThrow();
  });

  it('names the operation it rejected', () => {
    const em = { isInTransaction: () => true } as unknown as EntityManager;

    expect(() => assertAutocommit(em, 'writeThing')).toThrow(
      'writeThing requires autocommit; external transactions need commit hooks.',
    );
  });

  it('accepts a manager that cannot report transaction state', () => {
    expect(() =>
      assertAutocommit({} as unknown as EntityManager, 'writeThing'),
    ).not.toThrow();
  });
});
