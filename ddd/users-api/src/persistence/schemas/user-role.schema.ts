/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntitySchema } from '@mikro-orm/core';
import { UserRole } from '../entities/user-role.entity';

export const UserRoleSchema = new EntitySchema<UserRole>({
  class: UserRole,
  tableName: 'user_roles',
  properties: {
    userId: { type: 'string', primary: true, fieldName: 'user_id' },
    roleId: { type: 'string', primary: true, fieldName: 'role_id' },
  },
});
