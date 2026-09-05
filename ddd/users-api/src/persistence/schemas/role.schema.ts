/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { EntitySchema } from '@mikro-orm/core';
import { AggregateRoot, UnixTimestampType } from '@nestjs-pipeline/ddd-core';
import { Role } from '../../roles/domain/models/role.entity';

/**
 * MikroORM EntitySchema for the {@link Role} aggregate root.
 *
 * Employs official MikroORM `accessor: true` mappings for encapsulated properties
 * (`id`, `createdAt`, `updatedAt`, `name`). This allows MikroORM to interact with the
 * aggregate through public getters and setters without violating domain boundary encapsulation.
 */
export const RoleSchema = new EntitySchema<Role, AggregateRoot>({
  class: Role,
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
    name: { type: 'string', fieldName: 'name', unique: true, accessor: true },
  },
});
