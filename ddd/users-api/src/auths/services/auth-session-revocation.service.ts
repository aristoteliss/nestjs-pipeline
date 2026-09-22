/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import type { IWriteSideAggregateRepository } from '@nestjs-pipeline/ddd-core/application';
import { ConcurrencyConflictError } from '@nestjs-pipeline/ddd-core/domain';
import type { Auth } from '../domain/models/auth.entity';
import { COMMAND_REPOSITORY } from '../persistence/repository.tokens';

@Injectable()
export class AuthSessionRevocationService {
  constructor(
    @Inject(COMMAND_REPOSITORY.updateAuth)
    private readonly sessionRepository: IWriteSideAggregateRepository<Auth>,
  ) {}

  /** Persists revocation, returning null if concurrently deleted; exhausted conflicts propagate. */
  async revoke(session: Auth, now: number): Promise<Auth | null> {
    const maxAttempts = 3;
    let current: Auth | null = session;

    for (let attempt = 0; ; attempt++) {
      // refresh() may have recorded a revocation that is not persisted yet.
      if (
        current.revokedAt !== null &&
        current.version === current.getExpectedVersion()
      ) {
        return current;
      }
      current.revoke(now);
      try {
        await this.sessionRepository.save(current);
        return current;
      } catch (error) {
        if (
          !(error instanceof ConcurrencyConflictError) ||
          attempt === maxAttempts - 1
        )
          throw error;
        current = await this.sessionRepository.findById(session.id);
        if (!current) {
          return current;
        }
      }
    }
  }
}
