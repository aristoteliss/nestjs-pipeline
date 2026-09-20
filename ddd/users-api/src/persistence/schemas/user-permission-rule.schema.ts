/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntitySchema } from '@mikro-orm/core';
import { UserPermissionRule } from '../entities/user-permission-rule.entity';

export const UserPermissionRuleSchema = new EntitySchema<UserPermissionRule>({
  class: UserPermissionRule,
  tableName: 'user_permission_rules',
  properties: {
    userId: { type: 'string', primary: true, fieldName: 'user_id' },
    position: { type: 'integer', primary: true },
    source: { type: 'string', length: 16 },
    roleId: { type: 'string', nullable: true, fieldName: 'role_id' },
    capabilityId: { type: 'string', fieldName: 'capability_id' },
    subject: { type: 'string', length: 128 },
    action: { type: 'string', length: 64 },
    conditions: { type: 'text', nullable: true },
    fields: { type: 'text', nullable: true },
    inverted: { type: 'boolean' },
    reason: { type: 'text', nullable: true },
  },
});
