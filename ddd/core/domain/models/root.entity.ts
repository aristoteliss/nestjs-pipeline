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

import { isUuidV7, uuidv7 } from '@nestjs-pipeline/core';
import { ICacheKey } from '../interfaces/cache-key.interface';
import { RootEntitySnapshot } from '../interfaces/root-entity-snapshot.interface';

/**
 * Base entity for shared identity and lifecycle behavior.
 *
 * - Handles UUID v7 identity and root date invariants.
 * - Exposes immutable id, createdAt, and updatedAt getters.
 * - Exposes onUpdate/afterUpdate hooks for mutation tracking.
 * - Requires child entities to provide JSON serialization.
 */
export abstract class RootEntity<TSnapshot extends Partial<RootEntitySnapshot>>
  implements RootEntitySnapshot, ICacheKey {
  private readonly _id: string;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  protected constructor(snapshot?: Partial<RootEntitySnapshot>) {
    const id = snapshot?.id;
    const createdAt = snapshot?.createdAt;
    const updatedAt = snapshot?.updatedAt;

    if (
      id !== undefined &&
      createdAt !== undefined &&
      updatedAt !== undefined
    ) {
      this._id = RootEntity.normalizeId(id);
      this._createdAt = RootEntity.normalizeDate(createdAt);
      this._updatedAt = RootEntity.normalizeDate(updatedAt);
      return;
    }

    if (
      id !== undefined ||
      createdAt !== undefined ||
      updatedAt !== undefined
    ) {
      throw new Error(
        'id, createdAt, and updatedAt must be provided together when rehydrating an entity.',
      );
    }

    const now = new Date();
    this._id = uuidv7();
    this._createdAt = now;
    this._updatedAt = now;
  }

  abstract prefixKey: string;
  abstract cacheKey: string;

  protected static normalizeId(id?: string): string {
    if (typeof id !== 'string' || !isUuidV7(id)) {
      throw new Error('id must be a valid UUID v7.');
    }
    return id;
  }

  protected static normalizeDate(value?: Date | string): Date {
    if (value === undefined || value === null) {
      throw new Error('Date is empty.');
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      throw new Error('Date is empty.');
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() <= 1) {
      throw new Error('Date must be a valid non-empty date.');
    }
    return parsed;
  }

  get id(): string {
    return this._id;
  }
  get createdAt(): Date {
    return new Date(this._createdAt);
  }
  get updatedAt(): Date {
    return new Date(this._updatedAt);
  }

  protected onUpdate(): void {
    this._updatedAt = new Date();
    this.afterUpdate();
  }

  protected freezeState<S extends object>(state: S): Readonly<S> {
    return Object.freeze(state);
  }

  abstract afterUpdate(): void;

  abstract toJSON(): RootEntitySnapshot & TSnapshot;
}
