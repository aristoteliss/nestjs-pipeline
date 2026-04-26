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
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
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

export interface UserSnapshot extends Partial<RootEntitySnapshot> {
  readonly username: string;
  readonly email: string;
  readonly tenantId: string;
  readonly department?: string | null;
}

const USERNAME_MIN_LENGTH = 5;
const DEPARTMENT_MIN_LENGTH = 5;

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
  readonly tenantId: string;

  private constructor(snapshot: UserSnapshot) {
    super(User, snapshot);
    this._username = User.normalizeWithMinLength(snapshot, 'username', USERNAME_MIN_LENGTH);
    this._department = User.normalizeWithMinLength(snapshot, 'department', DEPARTMENT_MIN_LENGTH);
    this.email = snapshot.email;
    this.tenantId = snapshot.tenantId;
  }

  static create(
    username: string,
    email: string,
    tenantId: string,
    department?: string | null,
  ): UserCreateOutcome {
    const user = new User({
      username: User.normalizeWithMinLength({ username }, 'username', USERNAME_MIN_LENGTH),
      department: User.normalizeWithMinLength({ department }, 'department', DEPARTMENT_MIN_LENGTH),
      email,
      tenantId,
    });

    const events = [new UserCreatedEvent(user)];

    return new UserCreateOutcome(user, events);
  }

  static fromJSON(snapshot: UserSnapshot): User {
    return new User({
      id: User.normalizeId(snapshot.id),
      username: User.normalizeWithMinLength(snapshot, 'username', USERNAME_MIN_LENGTH),
      email: snapshot.email,
      tenantId: snapshot.tenantId,
      department: User.normalizeWithMinLength(snapshot, 'department', DEPARTMENT_MIN_LENGTH),
      createdAt: User.normalizeDate(snapshot.createdAt),
      updatedAt: User.normalizeDate(snapshot.updatedAt),
    });
  }

  private static normalizeWithMinLength<T extends object>(
    obj: T,
    key: keyof T,
    minLength: number,
  ): string {
    const text = obj[key] as string;
    const trimmed = text?.trim();
    if (!trimmed || trimmed.length < minLength) {
      throw new Error(
        `${String(key)} must be at least ${minLength} characters.`,
      );
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
  rename(username: string): UserUpdateOutcome {
    this._username = User.normalizeWithMinLength({ username }, 'username', USERNAME_MIN_LENGTH);
    return new UserUpdateOutcome(this, [new UserUpdatedEvent(this)]);
  }

  @Mutate()
  changeDepartment(department: string): UserUpdateOutcome {
    this._department = User.normalizeWithMinLength({ department }, 'department', DEPARTMENT_MIN_LENGTH);
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
      tenantId: this.tenantId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    });
  }

  afterUpdate(): void {
    // No side effects needed on update for User, but this method must be implemented
  }
}
