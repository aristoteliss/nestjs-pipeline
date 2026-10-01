/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ICache } from '@cqrs-ddd/core/application';
import { CACHE_TOKEN, PersistedWrite } from '@cqrs-ddd/core/persistence';
import { AggregateRepository, optimisticUpdate } from '@cqrs-ddd/mikro-orm';
import { Inject, Injectable } from '@nestjs/common';
import {
  MIKRO_ORM_CLIENT,
  MikroOrmStore,
} from '@persistence/mikro-orm.store.js';
import { Auth, type AuthSnapshot } from '../domain/models/auth.entity.js';
import { ConsumedRefreshToken } from '../domain/models/consumed-refresh-token.entity.js';

/** Version-conditioned writes of refresh rotation and revocation. */
@Injectable()
export class UpdateAuthCommandRepository extends AggregateRepository<
  AuthSnapshot,
  Auth,
  AuthSnapshot
> {
  constructor(
    @Inject(CACHE_TOKEN) cache: ICache<AuthSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) store: MikroOrmStore,
  ) {
    super(cache, store, Auth, Auth.aggregateName, Auth.fromJSON);
  }

  /**
   * Saves a rotation or revocation version-conditioned. A rotation's consumed
   * token is recorded first, so reuse stays detectable even when the version
   * update loses; recording the same hash twice keeps the first row.
   */
  @PersistedWrite<Auth>()
  async save(auth: Auth): Promise<AuthSnapshot> {
    const snapshot = auth.toJSON();
    const consumed = auth.getConsumedToken();
    if (consumed) {
      await this.store.em.upsert(
        ConsumedRefreshToken,
        { ...consumed },
        { onConflictFields: ['tokenHash'], onConflictAction: 'ignore' },
      );
    }
    await optimisticUpdate(
      this.store.em,
      Auth,
      auth,
      {
        refreshTokenHash: snapshot.refreshTokenHash,
        previousRefreshTokenHash: snapshot.previousRefreshTokenHash ?? null,
        rotatedAt: snapshot.rotatedAt ?? null,
        revokedAt: snapshot.revokedAt ?? null,
        updatedAt: snapshot.updatedAt,
      },
      'Auth',
    );
    return snapshot;
  }
}
