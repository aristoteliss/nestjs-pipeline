/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IWriteSideAggregateRepository } from '@cqrs-ddd/core/application';
import { ConcurrencyConflictError } from '@cqrs-ddd/core/domain';
import { Inject, Injectable } from '@nestjs/common';
import type { Auth } from '../domain/models/auth.entity';
import { COMMAND_REPOSITORY } from '../persistence/repository.tokens';

@Injectable()
export class AuthSessionRevocationService {
  constructor(
    @Inject(COMMAND_REPOSITORY.updateAuth)
    private readonly authRepository: IWriteSideAggregateRepository<Auth>,
  ) {}

  /**
   * Persists the revocation of `auth`, reloading it and trying again when a
   * concurrent write wins the version check, for at most three attempts. A
   * session whose revocation is already saved is returned without a write, and
   * the first revocation time is kept.
   *
   * @param auth - The login session to revoke. It may already carry an unsaved
   *   revocation that `Auth.refresh` recorded on token reuse.
   * @param now - Revocation time as a Unix timestamp in milliseconds.
   * @returns The revoked session, or `null` when it was deleted concurrently.
   * @throws ConcurrencyConflictError when all three attempts lose the version check.
   *
   * @example
   * ```ts
   * const revoked = await this.sessionRevocation.revoke(auth, Date.now());
   * if (!revoked) throw new InvalidRefreshTokenError();
   * ```
   */
  async revoke(auth: Auth, now: number): Promise<Auth | null> {
    const maxAttempts = 3;
    let current: Auth | null = auth;

    for (let attempt = 0; ; attempt++) {
      if (
        current.revokedAt !== null &&
        current.version === current.getExpectedVersion()
      ) {
        return current;
      }
      current.revoke(now);
      try {
        await this.authRepository.save(current);
        return current;
      } catch (error) {
        if (
          !(error instanceof ConcurrencyConflictError) ||
          attempt === maxAttempts - 1
        )
          throw error;
        current = await this.authRepository.findById(auth.id);
        if (!current) {
          return current;
        }
      }
    }
  }
}
