/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DomainException } from '@nestjs-pipeline/ddd-core';

/**
 * Domain exception thrown when an update mutation is invoked without any modifying fields.
 *
 * Extends {@link DomainException} to remain decoupled from web frameworks and HTTP.
 *
 * @example
 * ```ts
 * if (fields.username === undefined && fields.department === undefined) {
 *   throw new EmptyUserUpdateException();
 * }
 * ```
 */
export class EmptyUserUpdateException extends DomainException {
  /**
   * Creates a new {@link EmptyUserUpdateException}.
   *
   * @param message - Optional custom error message override.
   */
  constructor(message?: string) {
    super(message ?? 'At least one user field must be supplied for update.');
    this.name = 'EmptyUserUpdateException';
  }
}
