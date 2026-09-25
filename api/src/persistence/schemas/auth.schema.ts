/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AggregateRoot } from '@cqrs-ddd/core/domain';
import {
  rootEntityProperties,
  versionProperty,
} from '@cqrs-ddd/core/persistence';
import { BigIntType, EntitySchema } from '@mikro-orm/core';
import { Auth } from '../../auths/domain/models/auth.entity';

/** MikroORM EntitySchema for the {@link Auth} aggregate. */
export const AuthSchema = new EntitySchema<Auth, AggregateRoot>({
  // biome-ignore lint/suspicious/noExplicitAny: MikroORM schema requires a public constructor; Auth hides its constructor to enforce domain invariants.
  class: Auth as any,
  tableName: 'auth',
  properties: {
    ...rootEntityProperties(),
    version: versionProperty(),
    userId: { type: 'string', fieldName: 'user_id' },
    refreshTokenHash: {
      type: 'string',
      fieldName: 'refresh_token_hash',
      unique: true,
      accessor: true,
    },
    previousRefreshTokenHash: {
      type: 'string',
      fieldName: 'previous_refresh_token_hash',
      nullable: true,
      accessor: true,
    },
    rotatedAt: {
      type: new BigIntType('number'),
      fieldName: 'rotated_at',
      nullable: true,
      accessor: true,
    },
    expiresAt: { type: new BigIntType('number'), fieldName: 'expires_at' },
    revokedAt: {
      type: new BigIntType('number'),
      fieldName: 'revoked_at',
      nullable: true,
      accessor: true,
    },
  },
});
