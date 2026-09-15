/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { RootDomainEvent } from '@nestjs-pipeline/ddd-core';
import { Auth } from '../models/auth.entity';

export class CreatedAuthEvent extends RootDomainEvent<Auth> {
  constructor(entity: Auth) {
    super(entity);
  }
}
