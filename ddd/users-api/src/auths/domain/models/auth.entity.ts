/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { RootEntity, RootEntitySnapshot } from '@nestjs-pipeline/ddd-core';
import { CreatedAuthEvent } from '../events/create-auth.event';

export interface AuthSnapshot extends Partial<RootEntitySnapshot> {
  readonly userId: string;
  readonly token: string;
}

/**
 * Persisted authentication aggregate.
 *
 * New instances are created with {@link Auth.create}; persisted snapshots are
 * reconstituted with {@link Auth.fromJSON}. Direct construction is intentionally
 * unavailable outside the aggregate boundary.
 */
export class Auth extends RootEntity<AuthSnapshot> {
  /** Canonical logical aggregate name used for cache namespacing and event topics. */
  public static readonly aggregateName = 'auth';

  readonly userId: string;
  readonly token: string;

  private constructor(snapshot?: AuthSnapshot) {
    super(snapshot);
    if (!snapshot) {
      this.userId = '';
      this.token = '';
      return;
    }
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
    });
  }

  toJSON(): RootEntitySnapshot & AuthSnapshot {
    return this.freezeState({
      id: this.id,
      userId: this.userId,
      token: this.token,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    });
  }

  afterUpdate(): void {}
}
