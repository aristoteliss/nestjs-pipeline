/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Auth } from '../../domain/models/auth.entity';

export const AUTH_SESSIONS = Symbol('AUTH_SESSIONS');

/**
 * Finds login sessions by refresh-token digest and keeps the digests they
 * rotated away from, so a reused old token is detected. Loading and saving an
 * `Auth` by id goes through its command repositories instead.
 */
export interface IAuthSessions {
  /** The session whose current or immediately previous token has this hash, read from primary storage. */
  findByTokenHash(hash: string): Promise<Auth | null>;
  /** The session that rotated away from this hash earlier, read from primary storage. */
  findByConsumedTokenHash(hash: string): Promise<Auth | null>;
  /** Records a rotated-away hash; recording the same hash twice is a no-op. */
  recordConsumed(
    hash: string,
    authId: string,
    consumedAt: number,
  ): Promise<void>;
}
