/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { RootDomainEvent } from '@cqrs-ddd/core/domain';
import type { Auth } from '../models/auth.entity';

/** A session was revoked by logout or refresh-token reuse. */
export class AuthRevokedEvent extends RootDomainEvent<
  Auth,
  { userId: string }
> {
  constructor(entity: Auth) {
    super(entity, { userId: entity.userId });
  }
}
