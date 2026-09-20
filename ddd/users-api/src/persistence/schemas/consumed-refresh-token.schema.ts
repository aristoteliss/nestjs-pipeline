/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BigIntType, EntitySchema } from '@mikro-orm/core';
import { ConsumedRefreshToken } from '../entities/consumed-refresh-token.entity';

export const ConsumedRefreshTokenSchema =
  new EntitySchema<ConsumedRefreshToken>({
    class: ConsumedRefreshToken,
    tableName: 'auth_consumed_refresh_tokens',
    properties: {
      tokenHash: { type: 'string', primary: true, fieldName: 'token_hash' },
      authId: { type: 'string', fieldName: 'auth_id' },
      consumedAt: {
        type: new BigIntType('number'),
        fieldName: 'consumed_at',
      },
    },
  });
