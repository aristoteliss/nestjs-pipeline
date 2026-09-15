/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Raised when the business handler succeeded but persisting the completed
 * idempotency replay record failed.
 *
 * This distinction is operationally important: blindly retrying the request may
 * replay business side effects even though the caller received an error.
 * Consumers can use {@link executionSucceeded} to distinguish this state from a
 * handler failure and make an explicit retry/reconciliation decision.
 */
export class IdempotencyCompletionError extends Error {
  override readonly name = 'IdempotencyCompletionError';
  readonly executionSucceeded = true as const;

  constructor(
    public readonly key: string,
    public readonly claimId: string,
    public readonly cause: unknown,
  ) {
    super(
      `Handler execution succeeded, but the idempotency record for key "${key}" could not be completed.`,
    );
  }
}
