/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Why an idempotent request was rejected. */
export type IdempotencyConflictReason = 'in_progress' | 'key_reuse';

/**
 * Thrown by {@link IdempotencyBehavior} when a request cannot be served:
 *
 * - `in_progress` — an identical request is still running (`409 Conflict`);
 * - `key_reuse` — the key was already used with a **different** payload
 *   (`422 Unprocessable Entity`).
 *
 * Map it to the right HTTP status with {@link IdempotencyConflictFilter}.
 */
export class IdempotencyConflictError extends Error {
  /** The idempotency key in conflict. */
  readonly key: string;
  /** The request that was rejected, e.g. `CreateUserCommand`. */
  readonly requestName: string;
  /** Why the request was rejected. */
  readonly reason: IdempotencyConflictReason;
  /** Suggested HTTP status: `409` for `in_progress`, `422` for `key_reuse`. */
  readonly statusCode: number;

  constructor(params: {
    key: string;
    requestName: string;
    reason: IdempotencyConflictReason;
  }) {
    super(
      params.reason === 'in_progress'
        ? `A request with idempotency key "${params.key}" is already in ` +
            `progress for ${params.requestName}`
        : `Idempotency key "${params.key}" was already used for ` +
            `${params.requestName} with a different payload`,
    );
    this.name = 'IdempotencyConflictError';
    this.key = params.key;
    this.requestName = params.requestName;
    this.reason = params.reason;
    this.statusCode = params.reason === 'in_progress' ? 409 : 422;
  }
}
