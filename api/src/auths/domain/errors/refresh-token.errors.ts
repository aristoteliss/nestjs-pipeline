/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DomainException } from '@cqrs-ddd/core/domain';

/** The presented refresh token is unknown, expired, revoked or malformed. */
export class InvalidRefreshTokenError extends DomainException {
  readonly code = 'refresh_invalid';

  constructor() {
    super('Refresh token is invalid or expired');
  }
}

/** A rotated-away refresh token was presented again; its session is revoked. */
export class RefreshTokenReuseError extends DomainException {
  readonly code = 'refresh_reused';

  constructor() {
    super('Refresh token was already used; the session has been revoked');
  }
}
