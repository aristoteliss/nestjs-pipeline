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
import { UserCreatedEvent } from '../events/user-created.event';
import { UserDeletedEvent } from '../events/user-deleted.event';
import { UserUpdatedEvent } from '../events/user-updated.event';
import { UserCreateOutcome } from '../outcomes/user-create.outcome';
import { UserUpdateOutcome } from '../outcomes/user-update.outcome';
import {
  EmptyUserUpdateException,
  InvalidDepartmentException,
  InvalidUsernameException,
} from './errors';

export interface UserSnapshot extends Partial<RootEntitySnapshot> {
  readonly username: string;
  readonly email: string;
  readonly department?: string | null;
}

const USERNAME_MIN_LENGTH = 3;
const DEPARTMENT_MIN_LENGTH = 3;

/**
 * User domain entity following Clean Architecture / DDD principles.
 *
 * Inherits shared identity/lifecycle behavior from RootEntity.
 *
 * - State is private; mutated only through domain methods.
 * - `User.create()` is the only entry point for new users.
 * - `User.fromJson()` rebuilds the entity from persisted snapshot data.
 * - `rename()` enforces the username business rule and updates `updatedAt`.
 */
export class User extends CacheableEntity<UserSnapshot, User> {
  static readonly prefixKey = 'user:';

  private _username: string;
  private _department: string | null;
  readonly email: string;

  private constructor(snapshot: UserSnapshot) {
    super(User, snapshot);
    this._username = User.normalizeUsername(snapshot.username);
    this._department = User.normalizeDepartment(snapshot.department);
    this.email = snapshot.email;
  }

  static create(
    username: string,
    email: string,
    department?: string | null,
  ): UserCreateOutcome {
    const user = new User({
      username: User.normalizeUsername(username),
      department: User.normalizeDepartment(department),
      email,
    });

    const events = [new UserCreatedEvent(user)];

    return new UserCreateOutcome(user, events);
  }

  static fromJSON(snapshot: UserSnapshot): User {
    return new User({
      id: User.normalizeId(snapshot.id),
      username: User.normalizeUsername(snapshot.username),
      email: snapshot.email,
      department: User.normalizeDepartment(snapshot.department),
      createdAt: User.normalizeDate(snapshot.createdAt),
      updatedAt: User.normalizeDate(snapshot.updatedAt),
    });
  }

  private static normalizeUsername(username: string): string {
    const trimmed = username?.trim();
    if (!trimmed || trimmed.length < USERNAME_MIN_LENGTH) {
      throw new InvalidUsernameException(USERNAME_MIN_LENGTH, username);
    }
    return trimmed;
  }

  private static normalizeDepartment(
    department?: string | null,
  ): string | null {
    if (department === null || department === undefined) {
      return null;
    }
    const trimmed = department.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (trimmed.length < DEPARTMENT_MIN_LENGTH) {
      throw new InvalidDepartmentException(DEPARTMENT_MIN_LENGTH, department);
    }
    return trimmed;
  }

  get username(): string {
    return this._username;
  }

  get department(): string | null {
    return this._department;
  }

  @Mutate()
  update(fields: {
    username?: string | null;
    department?: string | null;
  }): UserUpdateOutcome {
    if (fields.username === undefined && fields.department === undefined) {
      throw new EmptyUserUpdateException();
    }
    if (fields.username !== undefined && fields.username !== null) {
      this._username = User.normalizeUsername(fields.username);
    }
    if (fields.department !== undefined) {
      this._department = User.normalizeDepartment(fields.department);
    }
    return new UserUpdateOutcome(this, [new UserUpdatedEvent(this)]);
  }

  @Mutate()
  delete(): UserUpdateOutcome {
    return new UserUpdateOutcome(this, [new UserDeletedEvent(this)]);
  }

  toJSON(): RootEntitySnapshot & UserSnapshot {
    return this.freezeState({
      id: this.id,
      username: this._username,
      department: this._department,
      email: this.email,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    });
  }

  afterUpdate(): void {
    // No side effects needed on update for User, but this method must be implemented
  }
}
