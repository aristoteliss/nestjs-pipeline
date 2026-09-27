/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ICache } from '@cqrs-ddd/core/application';
import { CACHE_TOKEN, PersistedWrite } from '@cqrs-ddd/core/persistence';
import { AggregateRepository, optimisticUpdate } from '@cqrs-ddd/mikro-orm';
import { Inject, Injectable } from '@nestjs/common';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { Auth, type AuthSnapshot } from '../domain/models/auth.entity';

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

  @PersistedWrite<Auth>()
  async save(auth: Auth): Promise<AuthSnapshot> {
    const snapshot = auth.toJSON();
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
