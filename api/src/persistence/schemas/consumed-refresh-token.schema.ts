/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BigIntType, EntitySchema } from '@mikro-orm/core';
import { ConsumedRefreshToken } from '../../auths/domain/models/consumed-refresh-token.entity.js';

export const AUTH_CONSUMED_REFRESH_TOKENS_AUTH_ID_INDEX =
  'auth_consumed_refresh_tokens_auth_id_index';

export const ConsumedRefreshTokenSchema =
  new EntitySchema<ConsumedRefreshToken>({
    class: ConsumedRefreshToken,
    tableName: 'auth_consumed_refresh_tokens',
    properties: {
      tokenHash: {
        type: 'string',
        length: 64,
        primary: true,
        fieldName: 'token_hash',
      },
      authId: { type: 'string', length: 64, fieldName: 'auth_id' },
      consumedAt: {
        type: new BigIntType('number'),
        fieldName: 'consumed_at',
      },
    },
    indexes: [
      {
        name: AUTH_CONSUMED_REFRESH_TOKENS_AUTH_ID_INDEX,
        properties: ['authId'],
      },
    ],
  });
