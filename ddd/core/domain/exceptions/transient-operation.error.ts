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

/**
 * Framework- and infrastructure-neutral signal that an application operation
 * failed for a reason the configured resilience policy may retry.
 *
 * Infrastructure adapters are responsible for translating their own transient
 * failures into this error. Application handlers do not inspect database,
 * driver, network, or transport-specific error codes.
 */
export class TransientOperationError extends Error {
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = TransientOperationError.name;
    this.cause = options?.cause;
  }
}

/** Retry predicate used by application-level resilience behaviors. */
export function isTransientOperationError(
  error: unknown,
): error is TransientOperationError {
  return error instanceof TransientOperationError;
}
