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

import {
  CacheableEntity,
  Mutate,
  type RootEntitySnapshot,
} from '@nestjs-pipeline/ddd-core';
import { RoleCreatedEvent } from '../events/role-created.event';
import { RoleDeletedEvent } from '../events/role-deleted.event';
import { RoleUpdatedEvent } from '../events/role-updated.event';
import { RoleCreateOutcome } from '../outcomes/role-create.outcome';
import { RoleUpdateOutcome } from '../outcomes/role-update.outcome';

export interface RoleSnapshot extends Partial<RootEntitySnapshot> {
  readonly name: string;
}

const ROLE_NAME_MIN_LENGTH = 3;

/**
 * Role domain entity following Clean Architecture / DDD principles.
 *
 * Inherits shared identity/lifecycle behavior from RootEntity.
 *
 * - State is private; mutated only through domain methods.
 * - `Role.create()` is the only entry point for new roles.
 * - `Role.fromJson()` rebuilds the entity from persisted snapshot data.
 * - `rename()` enforces the role-name business rule and updates `updatedAt`.
 */
export class Role extends CacheableEntity<RoleSnapshot, Role> {
  static readonly prefixKey = 'role:';

  private _name: string;

  private constructor(snapshot: RoleSnapshot) {
    super(Role, snapshot);
    this._name = Role.normalizeName(snapshot.name);
  }

  static create(name: string): RoleCreateOutcome {
    const role = new Role({
      name: Role.normalizeName(name),
    });

    const events = [new RoleCreatedEvent(role)];

    return new RoleCreateOutcome(role, events);
  }

  static fromJSON(snapshot: RoleSnapshot): Role {
    return new Role({
      id: Role.normalizeId(snapshot.id),
      name: Role.normalizeName(snapshot.name),
      createdAt: Role.normalizeDate(snapshot.createdAt),
      updatedAt: Role.normalizeDate(snapshot.updatedAt),
    });
  }

  private static normalizeName(name: string): string {
    const trimmed = name?.trim();
    if (!trimmed || trimmed.length < ROLE_NAME_MIN_LENGTH) {
      throw new Error(
        `Role name must be at least ${ROLE_NAME_MIN_LENGTH} characters.`,
      );
    }
    return trimmed;
  }

  get name(): string {
    return this._name;
  }

  @Mutate()
  rename(name: string): RoleUpdateOutcome {
    this._name = Role.normalizeName(name);
    return new RoleUpdateOutcome(this, [new RoleUpdatedEvent(this)]);
  }

  @Mutate()
  delete(): RoleUpdateOutcome {
    return new RoleUpdateOutcome(this, [new RoleDeletedEvent(this)]);
  }

  toJSON(): RootEntitySnapshot & RoleSnapshot {
    return this.freezeState({
      id: this.id,
      name: this._name,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    });
  }

  afterUpdate(): void {
    // No side effects needed on update for Role, but this method must be implemented
  }
}

