/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ValueViolation } from '../rules/value-violation';
import { DomainException } from './domain.exception';

function describeViolation(violation: ValueViolation): string {
  const { field } = violation;
  switch (violation.rule) {
    case 'required':
      return `${field} is required.`;
    case 'type':
      return `${field} must be a ${violation.expected}.`;
    case 'characters':
      return `${field} must not contain control characters or unpaired surrogates.`;
    case 'minLength':
      return `${field} must be at least ${violation.limit} characters.`;
    case 'maxLength':
      return `${field} must be at most ${violation.limit} characters.`;
    case 'pattern':
      return `${field} does not match the required format.`;
    case 'finite':
      return `${field} must be a finite number.`;
    case 'integer':
      return `${field} must be a safe integer.`;
    case 'min':
      return `${field} must be at least ${violation.limit}.`;
    case 'max':
      return `${field} must be at most ${violation.limit}.`;
  }
}

/**
 * A value broke a rule of a {@link textRule} or {@link numberRule}.
 *
 * It is the error both rules throw by default, and the base class for an
 * application's own exceptions, which then share its message format and its
 * `violation`. `domainErrorHttpStatus()` answers 400 for it, like any other
 * `DomainException`.
 *
 * The rejected value is not kept, so logging the exception cannot leak it.
 *
 * @example
 * ```ts
 * export class InvalidUsernameException extends InvalidValueException {}
 *
 * const username = textRule({
 *   field: 'username',
 *   minLength: 3,
 *   error: (violation) => new InvalidUsernameException(violation),
 * });
 *
 * username.normalize('ab');
 * // throws InvalidUsernameException: "username must be at least 3 characters."
 * ```
 */
export class InvalidValueException extends DomainException {
  readonly violation: ValueViolation;

  /**
   * @param violation - The broken rule.
   * @param message - Replaces the default message built from `violation`.
   */
  constructor(violation: ValueViolation, message?: string) {
    super(message ?? describeViolation(violation));
    this.violation = violation;
  }
}
