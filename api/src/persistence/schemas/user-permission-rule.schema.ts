/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntitySchema } from '@mikro-orm/core';
import { UserPermissionRule } from '../entities/user-permission-rule.entity.js';

export const USER_PERMISSION_RULES_ROLE_ID_INDEX =
  'user_permission_rules_role_id_index';
export const USER_PERMISSION_RULES_CAPABILITY_ID_INDEX =
  'user_permission_rules_capability_id_index';

export const UserPermissionRuleSchema = new EntitySchema<UserPermissionRule>({
  class: UserPermissionRule,
  tableName: 'user_permission_rules',
  properties: {
    userId: {
      type: 'string',
      length: 64,
      primary: true,
      fieldName: 'user_id',
    },
    position: { type: 'integer', primary: true },
    source: { type: 'string', length: 16 },
    roleId: {
      type: 'string',
      length: 64,
      nullable: true,
      fieldName: 'role_id',
    },
    capabilityId: {
      type: 'string',
      length: 64,
      fieldName: 'capability_id',
    },
    subject: { type: 'string', length: 128 },
    action: { type: 'string', length: 64 },
    conditions: { type: 'text', nullable: true },
    fields: { type: 'text', nullable: true },
    inverted: { type: 'boolean' },
    reason: { type: 'text', nullable: true },
  },
  indexes: [
    {
      name: USER_PERMISSION_RULES_ROLE_ID_INDEX,
      properties: ['roleId'],
    },
    {
      name: USER_PERMISSION_RULES_CAPABILITY_ID_INDEX,
      properties: ['capabilityId'],
    },
  ],
});
