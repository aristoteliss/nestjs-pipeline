/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { RootDomainEvent } from '@cqrs-ddd/core/domain';
import type { Auth } from '../models/auth.entity';

/** A session started. The payload carries no token material. */
export class CreatedAuthEvent extends RootDomainEvent<
  Auth,
  { userId: string; expiresAt: number }
> {
  constructor(entity: Auth) {
    super(entity, { userId: entity.userId, expiresAt: entity.expiresAt });
  }
}
