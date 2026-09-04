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
 * Domain exception thrown when a user's department violates business constraints
 * (e.g. non-empty but shorter than the required minimum length).
 */
export class InvalidDepartmentException extends BadRequestException {
  readonly minLength: number;
  readonly actualValue?: string | null;

  constructor(minLength = 3, actualValue?: string | null, message?: string) {
    const msg =
      message ?? `department must be at least ${minLength} characters.`;
    super(msg);
    this.name = 'InvalidDepartmentException';
    this.minLength = minLength;
    this.actualValue = actualValue;
  }
}
