/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AggregateRoot } from '@cqrs-ddd/core/domain';
import {
  rootEntityProperties,
  versionProperty,
} from '@cqrs-ddd/core/persistence';
import { EntitySchema } from '@mikro-orm/core';
import { Role } from '../../roles/domain/models/role.entity';

/**
 * MikroORM EntitySchema for the {@link Role} aggregate root.
 *
 * Employs official MikroORM `accessor: true` mappings for encapsulated properties
 * (`id`, `createdAt`, `updatedAt`, `name`). This allows MikroORM to interact with the
 * aggregate through public getters and setters without violating domain boundary encapsulation.
 */
export const RoleSchema = new EntitySchema<Role, AggregateRoot>({
  // biome-ignore lint/suspicious/noExplicitAny: MikroORM schema requires a public constructor; Role hides its constructor to enforce domain invariants.
  class: Role as any,
  tableName: 'roles',
  properties: {
    ...rootEntityProperties(),
    version: versionProperty(),
    name: { type: 'string', fieldName: 'name', unique: true, accessor: true },
  },
});
