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

  /**
   * Factory method to create a new User aggregate.
   *
   * Enforces business invariants on username and department, and records a {@link UserCreatedEvent}.
   *
   * @param username - Unique user display name (minimum 3 non-whitespace characters).
   * @param email - User's email address.
   * @param department - Optional department assignment (minimum 3 characters if provided).
   * @returns A {@link UserCreateOutcome} containing the new User entity and initial domain events.
   * @throws {InvalidUsernameException} If the username is empty, whitespace, or fewer than 3 characters.
   * @throws {InvalidDepartmentException} If the department is provided but fewer than 3 characters.
   *
   * @example
   * ```ts
   * const outcome = User.create('john_doe', 'john@example.com', 'Engineering');
   * const user = outcome.entity;
   * ```
   */
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

  /**
   * Reconstitutes an existing User entity from a persisted snapshot.
   *
   * @param snapshot - Persisted entity state snapshot.
   * @returns Rehydrated User aggregate instance.
   * @throws {InvalidUsernameException} If the snapshot username violates domain invariants.
   * @throws {InvalidDepartmentException} If the snapshot department violates domain invariants.
   *
   * @example
   * ```ts
   * const user = User.fromJSON(storedSnapshot);
   * ```
   */
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

  /**
   * Validates and trims the username invariant.
   *
   * @param username - Raw username input.
   * @returns Trimmed valid username.
   * @throws {InvalidUsernameException} When username is missing or shorter than minimum allowed length.
   */
  private static normalizeUsername(username: string): string {
    const trimmed = username?.trim();
    if (!trimmed || trimmed.length < USERNAME_MIN_LENGTH) {
      throw new InvalidUsernameException(USERNAME_MIN_LENGTH, username);
    }
    return trimmed;
  }

  /**
   * Validates and trims the optional department invariant.
   *
   * @param department - Raw department input.
   * @returns Trimmed valid department, or null if empty/omitted.
   * @throws {InvalidDepartmentException} When department is provided but shorter than minimum length.
   */
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

  /** Gets the normalized username. */
  get username(): string {
    return this._username;
  }

  /** Gets the normalized department, or null if unassigned. */
  get department(): string | null {
    return this._department;
  }

  /**
   * Updates mutable user fields and records a {@link UserUpdatedEvent}.
   *
   * @param fields - Object containing fields to update (`username` and/or `department`).
   * @returns A {@link UserUpdateOutcome} containing the mutated User entity and updated domain event.
   * @throws {EmptyUserUpdateException} When no updatable fields are provided.
   * @throws {InvalidUsernameException} When the new username violates validation rules.
   * @throws {InvalidDepartmentException} When the new department violates validation rules.
   *
   * @example
   * ```ts
   * const outcome = user.update({ department: 'Marketing' });
   * ```
   */
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

  /**
   * Marks the user as deleted and records a {@link UserDeletedEvent}.
   *
   * @returns A {@link UserUpdateOutcome} containing the entity and deletion domain event.
   *
   * @example
   * ```ts
   * const outcome = user.delete();
   * ```
   */
  @Mutate()
  delete(): UserUpdateOutcome {
    return new UserUpdateOutcome(this, [new UserDeletedEvent(this)]);
  }

  /**
   * Serializes the entity state into a frozen plain object snapshot.
   *
   * @returns Immutable snapshot of all entity fields.
   */
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

  /** Lifecycle hook invoked after mutation. */
  afterUpdate(): void {
    // No side effects needed on update for User, but this method must be implemented
  }
}
