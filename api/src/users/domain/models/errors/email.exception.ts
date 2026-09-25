/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { DomainException } from '@cqrs-ddd/core/domain';
import { User } from '../user.entity';

/** The email address of `user` already belongs to another user in the tenant. */
export class UniqueEmailException extends DomainException {
  readonly user: User;

  constructor(user: User) {
    super(`Email ${user.email} already exists`);
    this.name = 'UniqueEmailException';
    this.user = user;
  }
}
