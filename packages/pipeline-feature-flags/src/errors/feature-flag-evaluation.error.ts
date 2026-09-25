/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Raised when feature evaluation is configured to surface provider failures. */
export class FeatureFlagEvaluationError extends Error {
  override readonly name = 'FeatureFlagEvaluationError';

  constructor(
    public readonly flag: string,
    public readonly requestName: string,
    public readonly errorCode?: string,
    public readonly providerMessage?: string,
    /**
     * The provider error, when one was thrown. It becomes the error's `cause`,
     * which keeps its stack and any provider-specific fields.
     */
    options?: { cause?: unknown },
  ) {
    super(
      `Feature flag "${flag}" could not be evaluated for ${requestName}` +
        (errorCode ? ` (${errorCode})` : '') +
        (providerMessage ? `: ${providerMessage}` : ''),
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
  }
}
