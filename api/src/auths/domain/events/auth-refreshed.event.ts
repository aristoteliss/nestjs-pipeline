/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { RootDomainEvent } from '@cqrs-ddd/core/domain';
import type { Auth } from '../models/auth.entity';

/** A session rotated its refresh token. The payload carries no token material. */
export class AuthRefreshedEvent extends RootDomainEvent<
  Auth,
  { userId: string }
> {
  constructor(entity: Auth) {
    super(entity, { userId: entity.userId });
  }
}
