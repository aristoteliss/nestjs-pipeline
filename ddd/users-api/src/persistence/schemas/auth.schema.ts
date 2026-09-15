/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntitySchema } from '@mikro-orm/core';
import { AggregateRoot, UnixTimestampType } from '@nestjs-pipeline/ddd-core';
import { Auth } from '../../auths/domain/models/auth.entity';

/**
 * MikroORM EntitySchema for the {@link Auth} aggregate.
 *
 * The explicit `any` cast is the MikroORM v7 compatibility escape hatch for
 * aggregates with private constructors. It remains confined to persistence so
 * application/domain callers cannot bypass `Auth.create()` / `Auth.fromJSON()`.
 */
export const AuthSchema = new EntitySchema<Auth, AggregateRoot>({
  // biome-ignore lint/suspicious/noExplicitAny: MikroORM schema requires a public constructor; Auth hides its constructor to enforce domain invariants.
  class: Auth as any,
  tableName: 'auth',
  properties: {
    id: { type: 'string', primary: true, fieldName: 'id', accessor: true },
    createdAt: {
      type: UnixTimestampType,
      fieldName: 'created_at',
      accessor: true,
    },
    updatedAt: {
      type: UnixTimestampType,
      fieldName: 'updated_at',
      accessor: true,
    },
    userId: { type: 'string', fieldName: 'user_id' },
    token: { type: 'string' },
  },
});
