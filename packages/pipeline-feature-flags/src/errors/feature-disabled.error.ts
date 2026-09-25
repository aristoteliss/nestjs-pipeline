/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Thrown by {@link FeatureFlagBehavior} when a handler is gated behind a flag
 * that resolves to disabled and no `fallback` was configured.
 *
 * Over HTTP, register {@link FeatureDisabledFilter}: it answers `403 Forbidden`
 * with the flag, or a plain `404 Not Found` to hide the feature.
 */
export class FeatureDisabledError extends Error {
  /** The flag key that gated the request. */
  readonly flag: string;
  /** The request that was blocked, e.g. `CreateUserCommand`. */
  readonly requestName: string;

  constructor(flag: string, requestName: string) {
    super(`Feature "${flag}" is disabled for ${requestName}`);
    this.name = 'FeatureDisabledError';
    this.flag = flag;
    this.requestName = requestName;
  }
}
