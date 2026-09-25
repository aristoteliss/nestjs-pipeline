/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DomainException } from '@cqrs-ddd/core/domain';

/** A user update supplied no field to change. */
export class EmptyUserUpdateException extends DomainException {
  constructor() {
    super('At least one user field must be supplied for update.');
    this.name = 'EmptyUserUpdateException';
  }
}
