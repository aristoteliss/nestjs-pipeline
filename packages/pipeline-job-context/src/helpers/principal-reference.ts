/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PrincipalReference } from '../interfaces/principal-reference.interface.js';

/**
 * Copies only the identity fields of `principal`, so grants or session data an
 * application object also holds never reach a payload or a restore call.
 *
 * @example
 * ```ts
 * toReference({ id: 'u-1', type: 'user', sid: 's-1', grants: [] }); // { id: 'u-1', type: 'user' }
 * ```
 */
export function toReference(principal: PrincipalReference): PrincipalReference {
  const { id, type, sessionId } = principal;
  return sessionId === undefined ? { id, type } : { id, type, sessionId };
}
