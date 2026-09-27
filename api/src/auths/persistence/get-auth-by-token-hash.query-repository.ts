/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ICache } from '@cqrs-ddd/core/application';
import {
  CACHE_TOKEN,
  MapPersistenceErrors,
  QueryRepository,
} from '@cqrs-ddd/core/persistence';
import { mapPersistenceError } from '@cqrs-ddd/mikro-orm';
import { Inject, Injectable } from '@nestjs/common';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { GetAuthByTokenHashQuery } from '../application/cqrs/queries/get-auth-by-token-hash.query';
import { Auth } from '../domain/models/auth.entity';

/** Authoritative lookup of an active Auth session by current or immediately previous refresh token hash. */
@Injectable()
export class GetAuthByTokenHashQueryRepository extends QueryRepository<
  GetAuthByTokenHashQuery,
  Auth | null
> {
  constructor(
    @Inject(CACHE_TOKEN) cache: ICache<unknown>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  /**
   * Resolves the Auth aggregate matching the presented refresh token hash.
   *
   * Checks both the current active refreshTokenHash and the immediately previous
   * previousRefreshTokenHash, reading authoritative state with `{ refresh: true }`.
   *
   * @param query - Query containing the SHA-256 token hash to look up.
   * @returns The rehydrated Auth aggregate root, or null if no matching session exists.
   * @throws {TransientOperationError} When a retryable database failure occurs.
   *
   * @example
   * ```ts
   * const auth = await repo.find(new GetAuthByTokenHashQuery({ tokenHash }));
   * ```
   */
  @MapPersistenceErrors<[GetAuthByTokenHashQuery], GetAuthByTokenHashQuery>({
    entity: ([query]) => query,
    otherwise: (error) => mapPersistenceError(error, 'auth session lookup'),
  })
  async find(query: GetAuthByTokenHashQuery): Promise<Auth | null> {
    const session = await this.store.em.findOne(
      Auth,
      {
        $or: [
          { refreshTokenHash: query.tokenHash },
          { previousRefreshTokenHash: query.tokenHash },
        ],
      },
      { refresh: true },
    );
    return session ? Auth.fromJSON(session.toJSON()) : null;
  }
}
