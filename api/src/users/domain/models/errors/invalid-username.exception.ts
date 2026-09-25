/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DomainException } from '@cqrs-ddd/core/domain';

/** A username is empty or shorter than `minLength` characters after trimming. */
export class InvalidUsernameException extends DomainException {
  readonly minLength: number;
  readonly actualValue?: string | null;

  constructor(minLength: number, actualValue?: string | null) {
    super(`username must be at least ${minLength} characters.`);
    this.name = 'InvalidUsernameException';
    this.minLength = minLength;
    this.actualValue = actualValue;
  }
}
