/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import { ICache } from '@nestjs-pipeline/ddd-core/application';
import {
  AcknowledgePersisted,
  CACHE_TOKEN,
  Cache,
  filterCacheKey,
  MapPersistenceErrors,
  optimisticUpdate,
} from '@nestjs-pipeline/ddd-core/persistence';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { MikroOrmWriteSideCommandRepository } from '@persistence/mikro-orm-write-side.command-repository';
import { Auth, type AuthSnapshot } from '../domain/models/auth.entity';

/** Version-conditioned writes of refresh rotation and revocation. */
@Injectable()
export class UpdateAuthCommandRepository extends MikroOrmWriteSideCommandRepository<
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

  // Sessions hold refresh-token hashes and are never cached; the key is only invalidated.
  @Cache<Auth, AuthSnapshot>({
    invalidateKeys: (auth) => [
      filterCacheKey(Auth.aggregateName, { id: auth.id }),
    ],
  })
  @AcknowledgePersisted<[Auth]>({ entity: ([auth]) => auth })
  @MapPersistenceErrors<[Auth], Auth>({ entity: ([auth]) => auth, unique: [] })
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
