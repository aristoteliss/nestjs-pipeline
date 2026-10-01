/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntitySchema } from '@mikro-orm/core';
import { UserRole } from '../entities/user-role.entity.js';

export const UserRoleSchema = new EntitySchema<UserRole>({
  class: UserRole,
  tableName: 'user_roles',
  properties: {
    userId: {
      type: 'string',
      length: 64,
      primary: true,
      fieldName: 'user_id',
    },
    roleId: {
      type: 'string',
      length: 64,
      primary: true,
      fieldName: 'role_id',
    },
  },
});
