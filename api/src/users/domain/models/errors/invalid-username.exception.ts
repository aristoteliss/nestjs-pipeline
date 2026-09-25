/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DomainException } from '@cqrs-ddd/core/domain';

/**
 * Domain exception thrown when a user's username violates business constraints
 * (e.g. empty, whitespace-only, or shorter than the required minimum length).
 *
 * Extends {@link DomainException} to remain decoupled from web frameworks and HTTP.
 *
 * @example
 * ```ts
 * if (username.length < 3) {
 *   throw new InvalidUsernameException(3, username);
 * }
 * ```
 */
export class InvalidUsernameException extends DomainException {
  readonly minLength: number;
  readonly actualValue?: string | null;

  /**
   * Creates a new {@link InvalidUsernameException}.
   *
   * @param minLength - Minimum character length constraint (default: 3).
   * @param actualValue - The invalid username string that caused the failure.
   * @param message - Optional custom error message override.
   */
  constructor(minLength = 3, actualValue?: string | null, message?: string) {
    const msg = message ?? `username must be at least ${minLength} characters.`;
    super(msg);
    this.name = 'InvalidUsernameException';
    this.minLength = minLength;
    this.actualValue = actualValue;
  }
}
