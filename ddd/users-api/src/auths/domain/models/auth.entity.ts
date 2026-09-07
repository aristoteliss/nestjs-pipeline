/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { RootEntity, RootEntitySnapshot } from '@nestjs-pipeline/ddd-core';
import { CreatedAuthEvent } from '../events/create-auth.event';

export interface AuthSnapshot extends Partial<RootEntitySnapshot> {
  readonly userId: string;
  readonly token: string;
}

/**
 * Authentication session aggregate.
 *
 * Use `Auth.create()` when issuing a new session and `Auth.fromJSON()` when
 * reconstructing persisted session state. Direct permissive construction is
 * intentionally unavailable.
 */
export class Auth extends RootEntity<AuthSnapshot> {
  public static readonly aggregateName = 'auth';

  readonly userId: string;
  readonly token: string;

  private constructor(snapshot: AuthSnapshot) {
    super(snapshot);
    this.userId = snapshot.userId;
    this.token = snapshot.token;
  }

  static create(userId: string, token: string): Auth {
    const auth = new Auth({ userId, token });
    auth.apply(new CreatedAuthEvent(auth));
    return auth;
  }

  static fromJSON(snapshot: AuthSnapshot): Auth {
    return new Auth({
      id: Auth.normalizeId(snapshot.id),
      userId: snapshot.userId,
      token: snapshot.token,
      createdAt: Auth.normalizeDate(snapshot.createdAt),
      updatedAt: Auth.normalizeDate(snapshot.updatedAt),
      version: snapshot.version ?? 1,
    });
  }

  toJSON(): RootEntitySnapshot & AuthSnapshot {
    return this.freezeState({
      id: this.id,
      userId: this.userId,
      token: this.token,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
    });
  }

  afterUpdate(): void {}
}
