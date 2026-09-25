/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  ApplyMutation,
  Mutable,
  RootEntity,
  type RootEntitySnapshot,
} from '@cqrs-ddd/core/domain';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
} from '../errors/refresh-token.errors';
import { AuthRefreshedEvent } from '../events/auth-refreshed.event';
import { AuthRevokedEvent } from '../events/auth-revoked.event';
import { CreatedAuthEvent } from '../events/create-auth.event';

export interface AuthSnapshot extends Partial<RootEntitySnapshot> {
  readonly userId: string;
  readonly refreshTokenHash: string;
  readonly previousRefreshTokenHash?: string | null;
  readonly rotatedAt?: number | null;
  readonly expiresAt: number;
  readonly revokedAt?: number | null;
}

/** Outcome of presenting a refresh token to a session. */
export type RefreshOutcome = 'rotated' | 'grace';

/**
 * A login session. It stores only SHA-256 hashes of refresh tokens: the
 * current one and the one it replaced. Its lifetime is fixed at start.
 */
export class Auth extends RootEntity<AuthSnapshot> {
  public static readonly aggregateName = 'auth';

  readonly userId: string;
  readonly expiresAt: number;

  @Mutable<string>()
  private _refreshTokenHash: string;

  @Mutable<string | null>()
  private _previousRefreshTokenHash: string | null;

  @Mutable<number | null>()
  private _rotatedAt: number | null;

  @Mutable<number | null>()
  private _revokedAt: number | null;

  private constructor(snapshot?: AuthSnapshot) {
    super(snapshot);
    if (!snapshot) {
      this.userId = '';
      this.expiresAt = 0;
      this._refreshTokenHash = '';
      this._previousRefreshTokenHash = null;
      this._rotatedAt = null;
      this._revokedAt = null;
      return;
    }
    this.userId = snapshot.userId;
    this.expiresAt = snapshot.expiresAt;
    this._refreshTokenHash = snapshot.refreshTokenHash;
    this._previousRefreshTokenHash = snapshot.previousRefreshTokenHash ?? null;
    this._rotatedAt = snapshot.rotatedAt ?? null;
    this._revokedAt = snapshot.revokedAt ?? null;
  }

  static start(
    userId: string,
    refreshTokenHash: string,
    expiresAt: number,
  ): Auth {
    const auth = new Auth({ userId, refreshTokenHash, expiresAt });
    auth.apply(new CreatedAuthEvent(auth));
    return auth;
  }

  static fromJSON(snapshot: AuthSnapshot): Auth {
    return new Auth({
      id: Auth.normalizeId(snapshot.id),
      userId: snapshot.userId,
      refreshTokenHash: snapshot.refreshTokenHash,
      previousRefreshTokenHash: snapshot.previousRefreshTokenHash ?? null,
      rotatedAt: snapshot.rotatedAt ?? null,
      expiresAt: snapshot.expiresAt,
      revokedAt: snapshot.revokedAt ?? null,
      createdAt: Auth.normalizeDate(snapshot.createdAt),
      updatedAt: Auth.normalizeDate(snapshot.updatedAt),
      version: snapshot.version ?? 1,
    });
  }

  /**
   * Evaluates a presented refresh-token hash against this session.
   * Returns 'rotated' after moving to `nextHash`, or 'grace' when the immediately
   * previous token is presented within `graceMs` (state unchanged).
   *
   * @throws InvalidRefreshTokenError for a revoked or expired session or an unknown hash.
   * @throws RefreshTokenReuseError after revoking the session when the previous
   *   token is presented outside the grace window.
   */
  refresh(
    presentedHash: string,
    nextHash: string,
    now: number,
    graceMs: number,
  ): RefreshOutcome {
    if (this._revokedAt !== null || now >= this.expiresAt) {
      throw new InvalidRefreshTokenError();
    }
    if (presentedHash === this._refreshTokenHash) {
      this.applyRotation(nextHash, now);
      return 'rotated';
    }
    if (
      this._previousRefreshTokenHash !== null &&
      presentedHash === this._previousRefreshTokenHash
    ) {
      if (this._rotatedAt !== null && now - this._rotatedAt <= graceMs) {
        return 'grace';
      }
      this.revoke(now);
      throw new RefreshTokenReuseError();
    }
    throw new InvalidRefreshTokenError();
  }

  /** Ends the session; a revoked session stays revoked at its first revocation time. */
  revoke(now: number): void {
    if (this._revokedAt !== null) return;
    this.applyRevocation(now);
  }

  @ApplyMutation<Auth>({ event: (auth) => new AuthRefreshedEvent(auth) })
  protected applyRotation(nextHash: string, now: number): this {
    this.applyPatch({
      previousRefreshTokenHash: this._refreshTokenHash,
      refreshTokenHash: nextHash,
      rotatedAt: now,
    });
    return this;
  }

  @ApplyMutation<Auth>({ event: (auth) => new AuthRevokedEvent(auth) })
  protected applyRevocation(now: number): this {
    this.applyPatch({ revokedAt: now });
    return this;
  }

  get refreshTokenHash(): string {
    return this._refreshTokenHash;
  }

  /**
   * @internal For MikroORM persistence hydration only.
   * Application code changes aggregate state through domain methods and factories, never through this setter.
   */
  set refreshTokenHash(value: string) {
    this._refreshTokenHash = value;
  }

  get previousRefreshTokenHash(): string | null {
    return this._previousRefreshTokenHash;
  }

  /**
   * @internal For MikroORM persistence hydration only.
   * Application code changes aggregate state through domain methods and factories, never through this setter.
   */
  set previousRefreshTokenHash(value: string | null) {
    this._previousRefreshTokenHash = value ?? null;
  }

  get rotatedAt(): number | null {
    return this._rotatedAt;
  }

  /**
   * @internal For MikroORM persistence hydration only.
   * Application code changes aggregate state through domain methods and factories, never through this setter.
   */
  set rotatedAt(value: number | null) {
    this._rotatedAt = value === null ? null : Number(value);
  }

  get revokedAt(): number | null {
    return this._revokedAt;
  }

  /**
   * @internal For MikroORM persistence hydration only.
   * Application code changes aggregate state through domain methods and factories, never through this setter.
   */
  set revokedAt(value: number | null) {
    this._revokedAt = value === null ? null : Number(value);
  }

  get version(): number {
    return this._version;
  }

  /**
   * @internal For MikroORM persistence hydration only.
   * Application code changes aggregate state through domain methods and factories, never through this setter.
   */
  set version(value: number) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      this._version = value;
      this._persistedVersion = value;
    }
  }

  toJSON(): RootEntitySnapshot & AuthSnapshot {
    return this.freezeState({
      id: this.id,
      userId: this.userId,
      refreshTokenHash: this._refreshTokenHash,
      previousRefreshTokenHash: this._previousRefreshTokenHash,
      rotatedAt: this._rotatedAt,
      expiresAt: this.expiresAt,
      revokedAt: this._revokedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
    });
  }
}
