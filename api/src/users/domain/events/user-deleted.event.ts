/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { RootDomainEvent } from '@cqrs-ddd/core/domain';
import { User } from '../models/user.entity';

export class UserDeletedEvent extends RootDomainEvent<User> {
  public constructor(entity: User) {
    super(entity);
  }
}
