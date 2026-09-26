/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Raised by `DeadLetterRedriver` when a dead letter cannot be redriven: it does
 * not exist, is already resolved, has no registered request type or
 * dispatcher, or its payload was redacted and no `rebuild` is configured.
 * Nothing is dispatched and the record is unchanged.
 */
export class DeadLetterRedriveError extends Error {
  override readonly name = 'DeadLetterRedriveError';

  constructor(
    public readonly deadLetterId: string,
    public readonly reason: string,
  ) {
    super(`Cannot redrive dead letter ${deadLetterId}: ${reason}`);
  }
}
