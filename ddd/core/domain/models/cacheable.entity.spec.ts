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

import { describe, expect, it } from 'vitest';
import { RootEntitySnapshot } from '../interfaces/root-entity-snapshot.interface';
import { CacheableEntity } from './cacheable.entity';

interface ItemSnapshot extends Partial<RootEntitySnapshot> {
  title: string;
}

class ItemEntity extends CacheableEntity<ItemSnapshot, ItemEntity> {
  static readonly prefixKey = 'item:';
  readonly title: string;

  private constructor(snapshot: ItemSnapshot) {
    super(ItemEntity, snapshot);
    this.title = snapshot.title;
  }

  static create(title: string): ItemEntity {
    return new ItemEntity({ title });
  }

  static fromJSON(snapshot: ItemSnapshot): ItemEntity {
    return new ItemEntity(snapshot);
  }

  afterUpdate(): void {}

  toJSON(): RootEntitySnapshot & ItemSnapshot {
    return this.freezeState({
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      title: this.title,
    });
  }
}

describe('CacheableEntity', () => {
  it('constructs cacheKey combining prefixKey and id', () => {
    const item = ItemEntity.create('Test Item');
    expect(item.cacheKey).toBe(`item:${item.id}`);
  });

  it('deserializes JSON string back to entity using fromStringify', () => {
    const original = ItemEntity.create('Original Item');
    const jsonString = JSON.stringify(original.toJSON());

    const restored = CacheableEntity.fromStringify(
      jsonString,
      ItemEntity.fromJSON,
    );

    expect(restored).toBeInstanceOf(ItemEntity);
    expect(restored.id).toBe(original.id);
    expect(restored.title).toBe('Original Item');
    expect(restored.cacheKey).toBe(original.cacheKey);
  });
});
