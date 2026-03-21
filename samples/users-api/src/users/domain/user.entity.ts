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
  Mutate,
  RootEntity,
  type RootEntitySnapshot,
} from "@nestjs-pipeline/sample-core";


export interface UserSnapshot extends Partial<RootEntitySnapshot> {
  readonly username: string;
  readonly email: string;
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
export class User extends RootEntity<UserSnapshot> {
  private _username: string;
  private _email: string;

  private constructor(snapshot: UserSnapshot) {
    super(snapshot);
    this._username = User.normalizeUsername(snapshot.username);
    this._email = snapshot.email;
  }

  static create(username: string, email: string): User {
    return new User({
      username: User.normalizeUsername(username),
      email,
    });
  }

  static fromJSON(snapshot: UserSnapshot): User {
    return new User({
      id: User.normalizeId(snapshot.id),
      username: User.normalizeUsername(snapshot.username),
      email: snapshot.email,
      createdAt: User.normalizeDate(snapshot.createdAt, "createdAt"),
      updatedAt: User.normalizeDate(snapshot.updatedAt, "updatedAt"),
    });
  }

  get username(): string {
    return this._username;
  }
  get email(): string {
    return this._email;
  }

  @Mutate()
  rename(username: string): void {
    this._username = User.normalizeUsername(username);
  }

  toJSON(): RootEntitySnapshot & UserSnapshot {
    return this.freezeState({
      id: this.id,
      username: this._username,
      email: this._email,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    });
  }

  afterUpdate(): void {
    // No side effects needed on update for User, but this method must be implemented
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
}
