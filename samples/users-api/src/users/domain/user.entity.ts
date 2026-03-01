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
import { uuidv7 } from '@nestjs-pipeline/core';

/** Raw snapshot — used for persistence and reconstitution. */
export interface UserSnapshot {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly createdAt: Date;
}

/**
 * User domain entity following Clean Architecture / DDD principles.
 *
 * - Identity is carried by `id` (UUID v7).
 * - State is private; mutated only through domain methods that enforce invariants.
 * - `User.create()` is the only entry point for new users.
 * - `User.reconstitute()` rebuilds the entity from a persistence snapshot.
 * - `toSnapshot()` produces a plain-object snapshot for the repository to store.
 */
export class User {
  private readonly _id: string;
  private _username: string;
  private _email: string;
  private readonly _createdAt: Date;

  private constructor(snapshot: UserSnapshot) {
    this._id = snapshot.id;
    this._username = snapshot.username;
    this._email = snapshot.email;
    this._createdAt = snapshot.createdAt;
  }

  // ---------------------------------------------------------------------------
  // Factory methods
  // ---------------------------------------------------------------------------

  /** Create a brand-new user. Assigns a new UUID v7 and timestamps it. */
  static create(username: string, email: string): User {
    return new User({ id: uuidv7(), username, email, createdAt: new Date() });
  }

  /** Rebuild a User from a stored snapshot (no side-effects, no new id). */
  static reconstitute(snapshot: UserSnapshot): User {
    return new User(snapshot);
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  get id(): string { return this._id; }
  get username(): string { return this._username; }
  get email(): string { return this._email; }
  get createdAt(): Date { return this._createdAt; }

  // ---------------------------------------------------------------------------
  // Domain methods (enforce invariants)
  // ---------------------------------------------------------------------------

  /** Rename the user. Username must be at least 4 characters. */
  rename(username: string): void {
    const trimmed = username?.trim();
    if (!trimmed || trimmed.length < 4) {
      throw new Error('Username must be at least 4 characters.');
    }
    this._username = trimmed;
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /** Return an immutable plain-object snapshot for the repository. */
  toSnapshot(): UserSnapshot {
    return {
      id: this._id,
      username: this._username,
      email: this._email,
      createdAt: this._createdAt,
    };
  }
}
