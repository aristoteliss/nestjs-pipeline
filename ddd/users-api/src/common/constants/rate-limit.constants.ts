/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Points each key may consume per window on the shared limiter. Keys already
 * separate handlers, so a handler's limit is `points / cost` per window.
 */
export const RATE_LIMIT_CAPACITY = { points: 60, duration: 60 } as const;

/** Points consumed per call: 20 logins, 60 refreshes, 60 user creations a minute. */
export const RATE_LIMIT_COST = {
  /** Per source address; low because each attempt guesses a credential. */
  login: 3,
  /** Per source address; generous because many users can share one NAT address. */
  refresh: 1,
  /** Per acting principal. */
  createUser: 1,
} as const;
