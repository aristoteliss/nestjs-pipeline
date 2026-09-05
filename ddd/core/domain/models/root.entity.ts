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
import { RootEntitySnapshot } from '../interfaces/root-entity-snapshot.interface';

/**
 * Abstract base entity for DDD domain aggregates and entities.
 *
 * Provides core identity and lifecycle mechanics:
 * - **UUID v7 Identity**: Automatically generates time-ordered UUID v7 identifiers for new instances.
 * - **Lifecycle Timestamps**: Enforces invariant-checked `createdAt` and `updatedAt` tracking.
 * - **Accessor-Driven Persistence**: Exposes typed getters and setters (`id`, `createdAt`, `updatedAt`)
 *   compatible with MikroORM `accessor: true` mapping without breaking encapsulation.
 * - **Polymorphic Rehydration**: Static `RootEntity.from()` transparently handles instances, plain snapshots,
 *   or nullish database results.
 * - **Mutation Tracking**: Automatically updates `updatedAt` on `@Mutate()`-decorated methods
 *   and triggers the `afterUpdate()` lifecycle hook.
 *
 * @example Defining a domain aggregate
 * ```typescript
 * interface UserSnapshot extends Partial<RootEntitySnapshot> {
 *   readonly username: string;
 *   readonly email: string;
 * }
 *
 * export class User extends RootEntity<UserSnapshot> {
 *   private _username: string;
 *   readonly email: string;
 *
 *   private constructor(snapshot: UserSnapshot) {
 *     super(snapshot);
 *     this._username = snapshot.username!;
 *     this.email = snapshot.email!;
 *   }
 *
 *   static create(username: string, email: string): User {
 *     return new User({ username, email });
 *   }
 *
 *   static fromJSON(snapshot: UserSnapshot): User {
 *     return new User(snapshot);
 *   }
 *
 *   @Mutate()
 *   rename(newUsername: string): void {
 *     this._username = newUsername;
 *   }
 *
 *   afterUpdate(): void {
 *     // Aggregate domain side-effects or event recordings
 *   }
 *
 *   toJSON(): RootEntitySnapshot & UserSnapshot {
 *     return this.freezeState({
 *       id: this.id,
 *       username: this._username,
 *       email: this.email,
 *       createdAt: this.createdAt,
 *       updatedAt: this.updatedAt,
 *     });
 *   }
 * }
 * ```
 */
export abstract class RootEntity<TSnapshot extends Partial<RootEntitySnapshot>>
  implements RootEntitySnapshot
{
  private _id: string;
  private _createdAt: Date;
  private _updatedAt: Date;

  constructor(snapshot?: Partial<RootEntitySnapshot>) {
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

  protected static normalizeId(id?: string): string {
    if (typeof id !== 'string' || !isUuidV7(id)) {
      throw new Error('id must be a valid UUID v7.');
    }
    return id.trim();
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

  /**
   * Rehydrates or returns an already-hydrated entity instance.
   *
   * If `candidate` is already an instance of `RootEntity`, it is returned as-is.
   * Otherwise, if `candidate` is a snapshot object, it is rehydrated via the class's `fromJSON()` factory.
   */
  static from<
    T extends RootEntity<TSnapshot>,
    TSnapshot extends Partial<RootEntitySnapshot>,
  >(
    this:
      | { fromJSON(snapshot: TSnapshot): T }
      | (abstract new (
          ...args: unknown[]
        ) => T),
    candidate: T | TSnapshot | null | undefined,
  ): T | null {
    if (candidate === null || candidate === undefined) {
      return null;
    }
    if (candidate instanceof RootEntity) {
      return candidate as T;
    }
    // biome-ignore lint/complexity/noThisInStatic: Polymorphic static rehydration
    const ctor = this as unknown as { fromJSON(snapshot: TSnapshot): T };
    if (typeof ctor.fromJSON === 'function') {
      return ctor.fromJSON(candidate as TSnapshot);
    }
    throw new Error('Cannot rehydrate entity: missing fromJSON factory.');
  }

  get id(): string {
    return this._id;
  }
  set id(value: string) {
    this._id = RootEntity.normalizeId(value);
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }
  set createdAt(value: Date | string) {
    this._createdAt = RootEntity.normalizeDate(value);
  }

  get updatedAt(): Date {
    return new Date(this._updatedAt);
  }
  set updatedAt(value: Date | string) {
    this._updatedAt = RootEntity.normalizeDate(value);
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
