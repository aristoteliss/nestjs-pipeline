/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import {
  principalSegments,
  type SessionPrincipal,
} from '@common/types/session-principal.js';
import { joinKeySegments } from '@cqrs-ddd/safe-stringify';

export const sessionPrincipalStore = new AsyncLocalStorage<
  SessionPrincipal | undefined
>();

export function getSessionPrincipal(): SessionPrincipal | undefined {
  return sessionPrincipalStore.getStore();
}

/**
 * The current session principal as one escaped key segment (`user:u-1`), for
 * a key partitioned per caller. The identity comes from authentication, never
 * from the request payload.
 *
 * @returns The segment, or `undefined` when no identified principal is in
 *   scope, so that a partitioned key factory fails closed.
 *
 * @example
 * ```ts
 * rateLimit({ keyFactory: createPartitionedRateLimitKeyFactory(sessionPrincipalKey) });
 * ```
 */
export function sessionPrincipalKey(): string | undefined {
  const segments = principalSegments(getSessionPrincipal());
  return segments && joinKeySegments(segments);
}
