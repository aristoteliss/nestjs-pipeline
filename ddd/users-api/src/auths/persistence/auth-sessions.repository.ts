/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import { ConsumedRefreshToken } from '@persistence/entities/consumed-refresh-token.entity';
import { mapPersistenceError } from '@persistence/is-transient-persistence-error';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import type { IAuthSessions } from '../application/authentication.ports';
import { Auth } from '../domain/models/auth.entity';

/** Session lookups by refresh-token hash and the rotated-token history, from primary storage. */
@Injectable()
export class AuthSessionsRepository implements IAuthSessions {
  constructor(
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {}

  async findByTokenHash(hash: string): Promise<Auth | null> {
    try {
      const session = await this.store.em.findOne(
        Auth,
        {
          $or: [{ refreshTokenHash: hash }, { previousRefreshTokenHash: hash }],
        },
        { refresh: true },
      );
      return rehydrate(session);
    } catch (error) {
      throw mapPersistenceError(error, 'auth session lookup');
    }
  }

  async findByConsumedTokenHash(hash: string): Promise<Auth | null> {
    try {
      const em = this.store.em;
      const consumed = await em.findOne(
        ConsumedRefreshToken,
        { tokenHash: hash },
        { disableIdentityMap: true },
      );
      if (!consumed) return null;
      return rehydrate(
        await em.findOne(Auth, { id: consumed.authId }, { refresh: true }),
      );
    } catch (error) {
      throw mapPersistenceError(error, 'consumed refresh-token lookup');
    }
  }

  async recordConsumed(
    hash: string,
    authId: string,
    consumedAt: number,
  ): Promise<void> {
    try {
      await this.store.em
        .createQueryBuilder(ConsumedRefreshToken)
        .insert({ tokenHash: hash, authId, consumedAt })
        .onConflict('tokenHash')
        .ignore()
        .execute();
    } catch (error) {
      throw mapPersistenceError(error, 'consumed refresh-token record');
    }
  }
}

/** Rebuilds the aggregate through its factory so domain methods can record events. */
function rehydrate(entity: Auth | null): Auth | null {
  return entity ? Auth.fromJSON(entity.toJSON()) : null;
}
