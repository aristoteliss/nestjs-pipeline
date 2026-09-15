/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DomainException } from '@nestjs-pipeline/ddd-core';

/**
 * Domain exception thrown when a user's department violates business constraints
 * (e.g. non-empty but shorter than the required minimum length).
 *
 * Extends {@link DomainException} to remain decoupled from web frameworks and HTTP.
 *
 * @example
 * ```ts
 * if (department.length < 3) {
 *   throw new InvalidDepartmentException(3, department);
 * }
 * ```
 */
export class InvalidDepartmentException extends DomainException {
  readonly minLength: number;
  readonly actualValue?: string | null;

  /**
   * Creates a new {@link InvalidDepartmentException}.
   *
   * @param minLength - Minimum character length constraint (default: 3).
   * @param actualValue - The invalid department string that caused the failure.
   * @param message - Optional custom error message override.
   */
  constructor(minLength = 3, actualValue?: string | null, message?: string) {
    const msg =
      message ?? `department must be at least ${minLength} characters.`;
    super(msg);
    this.name = 'InvalidDepartmentException';
    this.minLength = minLength;
    this.actualValue = actualValue;
  }
}
