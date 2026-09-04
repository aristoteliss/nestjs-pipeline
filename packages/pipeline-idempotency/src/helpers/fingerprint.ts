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
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { createHash } from 'node:crypto';
import { stableStringify } from '@nestjs-pipeline/core';

/**
 * Produces a stable SHA-256 hex digest of an acyclic JSON-serializable value,
 * with object keys sorted so semantically-equal payloads hash identically
 * regardless of property order. Used to detect an idempotency key being reused
 * with a different body.
 */
export function fingerprintValue(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}
