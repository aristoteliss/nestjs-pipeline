/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DomainException } from '@cqrs-ddd/core/domain';

/** A non-empty department is shorter than `minLength` characters after trimming. */
export class InvalidDepartmentException extends DomainException {
  readonly minLength: number;
  readonly actualValue?: string | null;

  constructor(minLength: number, actualValue?: string | null) {
    super(`department must be at least ${minLength} characters.`);
    this.name = 'InvalidDepartmentException';
    this.minLength = minLength;
    this.actualValue = actualValue;
  }
}
