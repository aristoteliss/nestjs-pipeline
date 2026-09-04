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

import { BadRequestException } from '@nestjs/common/exceptions';

/**
 * Domain exception thrown when an update mutation is invoked without any modifying fields.
 *
 * Extends NestJS {@link BadRequestException} to ensure standard HTTP 400 responses
 * while maintaining domain model integrity.
 *
 * @example
 * ```ts
 * if (fields.username === undefined && fields.department === undefined) {
 *   throw new EmptyUserUpdateException();
 * }
 * ```
 */
export class EmptyUserUpdateException extends BadRequestException {
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
