/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Raised when a job payload's context is malformed, names an unconfigured
 * tenant, or carries fields a principal reference must not have, such as
 * grants. A payload is data written by whoever can write to the queue.
 *
 * @example
 * ```ts
 * throw new InvalidJobContextError('tenantId is not a configured tenant');
 * ```
 */
export class InvalidJobContextError extends Error {
  constructor(readonly reason: string) {
    super(`Invalid job context: ${reason}.`);
    this.name = InvalidJobContextError.name;
  }
}
