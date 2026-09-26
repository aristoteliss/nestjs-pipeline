/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Raised at startup when a named policy is invalid (for example a retry
 * without an error classifier, or no layer at all), and when code asks
 * {@link ResiliencePolicies} for a name that was never declared.
 */
export class ResiliencePolicyConfigurationError extends Error {
  override readonly name = 'ResiliencePolicyConfigurationError';

  constructor(
    public readonly policyName: string,
    public readonly reason: string,
  ) {
    super(`Invalid resilience policy '${policyName}': ${reason}`);
  }
}
