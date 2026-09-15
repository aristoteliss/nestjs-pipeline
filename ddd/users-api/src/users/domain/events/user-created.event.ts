/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { RootDomainEvent } from '@nestjs-pipeline/ddd-core';
import { User } from '../models/user.entity';

export class UserCreatedEvent extends RootDomainEvent<User> {
  public constructor(entity: User) {
    super(entity);
  }
}
