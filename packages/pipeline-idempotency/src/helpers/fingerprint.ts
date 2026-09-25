/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash } from 'node:crypto';
import { stableStringify } from '@cqrs-ddd/safe-stringify';

/**
 * Produces a stable SHA-256 hex digest of an acyclic JSON-serializable value,
 * with object keys sorted so semantically-equal payloads hash identically
 * regardless of property order. Used to detect an idempotency key being reused
 * with a different body.
 */
export function fingerprintValue(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}
