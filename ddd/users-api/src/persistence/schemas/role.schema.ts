/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntitySchema } from '@mikro-orm/core';
import { AggregateRoot, UnixTimestampType } from '@nestjs-pipeline/ddd-core';
import { Role } from '../../roles/domain/models/role.entity';

/**
 * MikroORM EntitySchema for the {@link Role} aggregate root.
 *
 * Employs official MikroORM `accessor: true` mappings for encapsulated properties
 * (`id`, `createdAt`, `updatedAt`, `name`). This allows MikroORM to interact with the
 * aggregate through public getters and setters without violating domain boundary encapsulation.
 *
 * MikroORM v7 requires an explicit schema-level cast when an entity deliberately
 * hides its constructor. The escape hatch remains confined to persistence.
 */
export const RoleSchema = new EntitySchema<Role, AggregateRoot>({
  // biome-ignore lint/suspicious/noExplicitAny: MikroORM schema requires a public constructor; Role hides its constructor to enforce domain invariants.
  class: Role as any,
  tableName: 'roles',
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
    name: { type: 'string', fieldName: 'name', unique: true, accessor: true },
  },
});
