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
