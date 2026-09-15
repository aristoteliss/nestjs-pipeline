/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Raised before execution when a declarative handler-level resilience policy is
 * ambiguous or unsafe (for example a side-effectful command retry without an
 * explicit replay-safety acknowledgement).
 */
export class ResilienceConfigurationError extends Error {
  override readonly name = 'ResilienceConfigurationError';

  constructor(
    public readonly requestName: string,
    public readonly requestKind: string,
    public readonly reason: string,
  ) {
    super(
      `Unsafe resilience configuration for ${requestKind} ${requestName}: ${reason}`,
    );
  }
}
