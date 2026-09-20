/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Why an idempotent request was rejected. */
export type IdempotencyConflictReason =
  | 'in_progress'
  | 'key_reuse'
  | 'replay_scope';

function conflictMessage(params: {
  key: string;
  requestName: string;
  reason: IdempotencyConflictReason;
}): string {
  switch (params.reason) {
    case 'in_progress':
      return (
        `A request with idempotency key "${params.key}" is already in ` +
        `progress for ${params.requestName}`
      );
    case 'replay_scope':
      return (
        `Idempotency key "${params.key}" holds a ${params.requestName} response ` +
        'authorized under a different scope than this caller; it cannot be replayed'
      );
    default:
      return (
        `Idempotency key "${params.key}" was already used for ` +
        `${params.requestName} with a different payload`
      );
  }
}

/**
 * Thrown by {@link IdempotencyBehavior} when a request cannot be served:
 *
 * - `in_progress` — an identical request is still running (`409 Conflict`);
 * - `key_reuse` — the key was already used with a **different** payload
 *   (`422 Unprocessable Entity`);
 * - `replay_scope` — the stored response was authorized under a different scope
 *   than the current caller's, or the record predates scope capture
 *   (`409 Conflict`). The handler is not re-executed and the record is kept.
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
  /**
   * Suggested HTTP status: `409` for `in_progress` and `replay_scope`, `422` for
   * `key_reuse`.
   */
  readonly statusCode: number;

  constructor(params: {
    key: string;
    requestName: string;
    reason: IdempotencyConflictReason;
  }) {
    super(conflictMessage(params));
    this.name = 'IdempotencyConflictError';
    this.key = params.key;
    this.requestName = params.requestName;
    this.reason = params.reason;
    this.statusCode = params.reason === 'key_reuse' ? 422 : 409;
  }
}
