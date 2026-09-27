/* Copyright (C) 2026-present Aristotelis — see repository license. */

export const REFRESH_TOKENS = Symbol('REFRESH_TOKENS');

/** Creates opaque refresh tokens and the digests sessions store instead of them. */
export interface IRefreshTokens {
  generate(): string;
  /** Must be deterministic and unsalted: the digest is the session lookup key. */
  hash(token: string): string;
}
