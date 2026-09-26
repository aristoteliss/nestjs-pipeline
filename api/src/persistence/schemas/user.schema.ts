/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AggregateRoot } from '@cqrs-ddd/core/domain';
import {
  rootEntityProperties,
  versionProperty,
} from '@cqrs-ddd/core/persistence';
import { EntitySchema } from '@mikro-orm/core';
import { User } from '../../users/domain/models/user.entity';

/**
 * MikroORM EntitySchema for the {@link User} aggregate root.
 *
 * `username`, `department` and `version` map through the aggregate's private hydration setters
 * (`accessor: true`, like `rootEntityProperties()`): MikroORM assigns them on load, and
 * application code, which cannot, changes state through domain methods.
 */
export const UserSchema = new EntitySchema<User, AggregateRoot>({
  // biome-ignore lint/suspicious/noExplicitAny: MikroORM schema requires a public constructor; User hides its constructor to enforce domain invariants.
  class: User as any,
  tableName: 'users',
  properties: {
    ...rootEntityProperties(),
    version: versionProperty(),
    username: { type: 'string', fieldName: 'username', accessor: true },
    department: {
      type: 'string',
      fieldName: 'department',
      nullable: true,
      accessor: true,
    },
    email: { type: 'string', unique: true },
  },
});
