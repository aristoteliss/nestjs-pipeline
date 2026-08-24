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

import { uuidv7 } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import { RootEntitySnapshot } from '../interfaces/root-entity-snapshot.interface';
import { RootEntity } from './root.entity';

interface TestSnapshot extends Partial<RootEntitySnapshot> {
  name: string;
}

class TestEntity extends RootEntity<TestSnapshot> {
  prefixKey = 'test:';
  name: string;
  afterUpdateHook = vi.fn();

  constructor(snapshot?: Partial<TestSnapshot>) {
    super(snapshot);
    this.name = snapshot?.name ?? 'default';
  }

  get cacheKey(): string {
    return `${this.prefixKey}${this.id}`;
  }

  triggerUpdate(): void {
    this.onUpdate();
  }

  afterUpdate(): void {
    this.afterUpdateHook();
  }

  toJSON(): RootEntitySnapshot & TestSnapshot {
    return this.freezeState({
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      name: this.name,
    });
  }
}

describe('RootEntity', () => {
  it('initializes new entity with generated UUIDv7 and current timestamps', () => {
    const entity = new TestEntity({ name: 'Alpha' });

    expect(entity.id).toBeDefined();
    expect(entity.createdAt).toBeInstanceOf(Date);
    expect(entity.updatedAt).toBeInstanceOf(Date);
    expect(entity.cacheKey).toBe(`test:${entity.id}`);
  });

  it('rehydrates an entity when id, createdAt, and updatedAt are provided together', () => {
    const id = uuidv7();
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');

    const entity = new TestEntity({ id, createdAt, updatedAt, name: 'Rehydrated' });

    expect(entity.id).toBe(id);
    expect(entity.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(entity.updatedAt.toISOString()).toBe(updatedAt.toISOString());
    expect(entity.name).toBe('Rehydrated');
  });

  it('throws when only partial rehydration fields are provided', () => {
    const id = uuidv7();
    expect(() => new TestEntity({ id })).toThrowError(
      'id, createdAt, and updatedAt must be provided together when rehydrating an entity.',
    );
  });

  it('throws on invalid UUIDv7 id during rehydration', () => {
    expect(() =>
      new TestEntity({
        id: 'invalid-uuid',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).toThrowError('id must be a valid UUID v7.');
  });

  it('throws on invalid date during rehydration', () => {
    const id = uuidv7();
    expect(() =>
      new TestEntity({
        id,
        createdAt: 'invalid-date' as any,
        updatedAt: new Date(),
      }),
    ).toThrowError('Date must be a valid non-empty date.');
  });

  it('updates updatedAt and calls afterUpdate hook on mutation', () => {
    const entity = new TestEntity({ name: 'Initial' });
    const initialUpdatedAt = entity.updatedAt;

    entity.triggerUpdate();

    expect(entity.afterUpdateHook).toHaveBeenCalledTimes(1);
    expect(entity.updatedAt.getTime()).toBeGreaterThanOrEqual(initialUpdatedAt.getTime());
  });

  it('serializes state with toJSON', () => {
    const entity = new TestEntity({ name: 'Serialized' });
    const json = entity.toJSON();

    expect(json.id).toBe(entity.id);
    expect(json.name).toBe('Serialized');
    expect(Object.isFrozen(json)).toBe(true);
  });
});

