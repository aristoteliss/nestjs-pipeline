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
import { ICacheKey, UnixTimestampType } from '@nestjs-pipeline/ddd-core';
import { User } from '../../users/domain/models/user.entity';

export const UserSchema = new EntitySchema<User, ICacheKey>({
  class: User,
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
