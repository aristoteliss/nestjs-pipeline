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
  readonly tenantId?: string;
  readonly department?: string;
}

const USERNAME_MIN_LENGTH = 5;

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
  readonly email: string;
  readonly tenantId?: string;
  readonly department?: string;

  private constructor(snapshot: UserSnapshot) {
    super(User, snapshot);
    this._username = User.normalizeUsername(snapshot.username);
    this.email = snapshot.email;
    this.tenantId = snapshot.tenantId;
    this.department = snapshot.department;
  }

  static create(
    username: string,
    email: string,
    tenantId?: string,
    department?: string,
  ): UserCreateOutcome {
    const user = new User({
      username: User.normalizeUsername(username),
      email,
      tenantId,
      department,
    });

    const events = [new UserCreatedEvent(user)];

    return new UserCreateOutcome(user, events);
  }

  static fromJSON(snapshot: UserSnapshot): User {
    return new User({
      id: User.normalizeId(snapshot.id),
      username: User.normalizeUsername(snapshot.username),
      email: snapshot.email,
      tenantId: snapshot.tenantId,
      department: snapshot.department,
      createdAt: User.normalizeDate(snapshot.createdAt),
      updatedAt: User.normalizeDate(snapshot.updatedAt),
    });
  }

  private static normalizeUsername(username: string): string {
    const trimmed = username?.trim();
    if (!trimmed || trimmed.length < USERNAME_MIN_LENGTH) {
      throw new Error(
        `Username must be at least ${USERNAME_MIN_LENGTH} characters.`,
      );
    }
    return trimmed;
  }

  get username(): string {
    return this._username;
  }

  @Mutate()
  rename(username: string): UserUpdateOutcome {
    this._username = User.normalizeUsername(username);
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
      email: this.email,
      tenantId: this.tenantId,
      department: this.department,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    });
  }

  afterUpdate(): void {
    // No side effects needed on update for User, but this method must be implemented
  }
}
