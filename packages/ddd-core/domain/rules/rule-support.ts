/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { InvalidValueException } from '../exceptions/invalid-value.exception';
import type { ValueViolation, ValueViolationError } from './value-violation';

/** Throws a `TypeError` naming the rule when `field` is not a non-empty string. */
export function assertField(field: unknown, rule: string): void {
  if (typeof field !== 'string' || field.trim().length === 0) {
    throw new TypeError(`${rule}: field must be a non-empty string.`);
  }
}

/** Returns a function that throws the rule's error for a violation, frozen. */
export function violationThrower(
  error: ValueViolationError = (violation) =>
    new InvalidValueException(violation),
): (violation: ValueViolation) => never {
  return (violation) => {
    throw error(Object.freeze(violation));
  };
}
