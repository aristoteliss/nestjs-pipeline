/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ICache } from '@cqrs-ddd/core/application';
import {
  CACHE_TOKEN,
  MapPersistenceErrors,
  QueryRepository,
} from '@cqrs-ddd/core/persistence';
import { mapPersistenceError } from '@cqrs-ddd/mikro-orm';
import { Inject, Injectable } from '@nestjs/common';
import {
  MIKRO_ORM_CLIENT,
  MikroOrmStore,
} from '@persistence/mikro-orm.store.js';
import { GetAuthByConsumedTokenHashQuery } from '../application/cqrs/queries/get-auth-by-consumed-token-hash.query.js';
import { Auth } from '../domain/models/auth.entity.js';
import { ConsumedRefreshToken } from '../domain/models/consumed-refresh-token.entity.js';

/** Authoritative lookup of an Auth session that previously rotated away from a given token hash. */
@Injectable()
export class GetAuthByConsumedTokenHashQueryRepository extends QueryRepository<
  GetAuthByConsumedTokenHashQuery,
  Auth | null
> {
  constructor(
    @Inject(CACHE_TOKEN) cache: ICache<unknown>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  /**
   * Resolves the Auth aggregate that previously consumed the presented refresh token hash.
   *
   * Bypasses identity map caching to inspect historical consumed token records,
   * then authoritatively loads the associated Auth session with `{ refresh: true }`.
   *
   * @param query - Query containing the SHA-256 token hash to look up in consumed history.
   * @returns The rehydrated Auth aggregate root, or null if the token was never consumed.
   * @throws {TransientOperationError} When a retryable database failure occurs.
   *
   * @example
   * ```ts
   * const auth = await repo.find(new GetAuthByConsumedTokenHashQuery({ tokenHash }));
   * ```
   */
  @MapPersistenceErrors<
    [GetAuthByConsumedTokenHashQuery],
    GetAuthByConsumedTokenHashQuery
  >({
    entity: ([query]) => query,
    otherwise: (error) =>
      mapPersistenceError(error, 'consumed refresh-token lookup'),
  })
  async find(query: GetAuthByConsumedTokenHashQuery): Promise<Auth | null> {
    const em = this.store.em;
    const consumed = await em.findOne(
      ConsumedRefreshToken,
      { tokenHash: query.tokenHash },
      { disableIdentityMap: true },
    );
    if (!consumed) return null;
    const session = await em.findOne(
      Auth,
      { id: consumed.authId },
      { refresh: true },
    );
    return session ? Auth.fromJSON(session.toJSON()) : null;
  }
}
