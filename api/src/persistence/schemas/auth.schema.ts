/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AggregateRoot } from '@cqrs-ddd/core/domain';
import { rootEntityProperties, versionProperty } from '@cqrs-ddd/mikro-orm';
import { BigIntType, EntitySchema } from '@mikro-orm/core';
import { Auth } from '../../auths/domain/models/auth.entity';

export const AUTH_REFRESH_TOKEN_HASH_UNIQUE = 'auth_refresh_token_hash_unique';
export const AUTH_PREVIOUS_REFRESH_TOKEN_HASH_INDEX =
  'auth_previous_refresh_token_hash_idx';
export const AUTH_USER_ID_INDEX = 'auth_user_id_idx';

/** MikroORM EntitySchema for the {@link Auth} aggregate. */
export const AuthSchema = new EntitySchema<Auth, AggregateRoot>({
  // biome-ignore lint/suspicious/noExplicitAny: MikroORM schema requires a public constructor; Auth hides its constructor to enforce domain invariants.
  class: Auth as any,
  tableName: 'auth',
  properties: {
    ...rootEntityProperties(),
    version: versionProperty(),
    userId: { type: 'string', length: 64, fieldName: 'user_id' },
    refreshTokenHash: {
      type: 'string',
      length: 64,
      fieldName: 'refresh_token_hash',
      accessor: true,
    },
    previousRefreshTokenHash: {
      type: 'string',
      length: 64,
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
  indexes: [
    {
      name: AUTH_REFRESH_TOKEN_HASH_UNIQUE,
      properties: ['refreshTokenHash'],
      type: 'unique',
    },
    {
      name: AUTH_PREVIOUS_REFRESH_TOKEN_HASH_INDEX,
      properties: ['previousRefreshTokenHash'],
    },
    {
      name: AUTH_USER_ID_INDEX,
      properties: ['userId'],
    },
  ],
});
