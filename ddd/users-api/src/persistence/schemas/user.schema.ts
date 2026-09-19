/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntitySchema } from '@mikro-orm/core';
import { AggregateRoot } from '@nestjs/cqrs';
import { UnixTimestampType } from '@nestjs-pipeline/ddd-core/persistence';
import { User } from '../../users/domain/models/user.entity';

/**
 * MikroORM EntitySchema for the {@link User} aggregate root.
 *
 * Employs official MikroORM `accessor: true` mappings for encapsulated properties
 * (`id`, `createdAt`, `updatedAt`, `username`, `department`). This allows MikroORM
 * to access state exclusively through public getters and setters without requiring
 * private field `@ts-expect-error` bypasses or breaking domain encapsulation.
 *
 * MikroORM v7 requires an explicit schema-level cast when an entity deliberately
 * hides its constructor. The escape hatch stays in persistence; domain callers
 * still cannot instantiate the aggregate directly.
 */
export const UserSchema = new EntitySchema<User, AggregateRoot>({
  // biome-ignore lint/suspicious/noExplicitAny: MikroORM schema requires a public constructor; User hides its constructor to enforce domain invariants.
  class: User as any,
  tableName: 'users',
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
    version: {
      type: 'number',
      fieldName: 'version',
      default: 1,
      accessor: true,
      version: true,
    },
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
