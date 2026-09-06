/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { DomainException } from '@nestjs-pipeline/ddd-core';

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
