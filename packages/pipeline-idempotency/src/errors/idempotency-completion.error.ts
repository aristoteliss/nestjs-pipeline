/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Which post-execution step failed.
 *
 * - `snapshot` — the handler's response could not be serialized into a replayable
 *   record (a cycle, a function, an unsupported type).
 * - `store`    — the record was serializable but the store rejected the write.
 */
export type IdempotencyFinalizationPhase = 'snapshot' | 'store';

/**
 * Raised when the business handler succeeded but the idempotency record could
 * not be finalized.
 *
 * Retrying the request may repeat business side effects even though the caller
 * received an error. Consumers can use {@link executionSucceeded} to distinguish this state from a
 * handler failure and make an explicit retry/reconciliation decision, and
 * {@link phase} to tell an unusable response apart from an unavailable store.
 *
 * In both phases the claim is deliberately retained until its TTL expires. The
 * side effects have already happened, so releasing the key would let the very
 * next retry repeat them immediately. Retention does not prevent all duplicates
 * — it only prevents immediate reentry while the claim is still live.
 */
export class IdempotencyCompletionError extends Error {
  override readonly name = 'IdempotencyCompletionError';
  readonly executionSucceeded = true as const;

  constructor(
    public readonly key: string,
    public readonly claimId: string,
    public readonly cause: unknown,
    public readonly phase: IdempotencyFinalizationPhase = 'store',
  ) {
    super(
      phase === 'snapshot'
        ? `Handler execution succeeded, but its response for idempotency key "${key}" could not be serialized into a replayable record. The claim is retained until it expires so the side effects are not immediately repeated.`
        : `Handler execution succeeded, but the idempotency record for key "${key}" could not be completed.`,
    );
  }
}
