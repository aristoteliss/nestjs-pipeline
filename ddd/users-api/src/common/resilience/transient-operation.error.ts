/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Framework- and infrastructure-neutral signal that an application operation
 * failed for a reason the configured resilience policy may retry.
 *
 * Infrastructure adapters are responsible for translating their own transient
 * failures into this error. Application handlers do not inspect database,
 * driver, network, or transport-specific error codes.
 */
export class TransientOperationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = TransientOperationError.name;
  }
}

/** Retry predicate used by application-level resilience behaviors. */
export function isTransientOperationError(
  error: unknown,
): error is TransientOperationError {
  return error instanceof TransientOperationError;
}
