/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntitySchema } from '@mikro-orm/core';
import { RoleCapability } from '../entities/role-capability.entity';

export const RoleCapabilitySchema = new EntitySchema<RoleCapability>({
  class: RoleCapability,
  tableName: 'role_capabilities',
  properties: {
    roleId: { type: 'string', primary: true, fieldName: 'role_id' },
    capabilityId: { type: 'string', primary: true, fieldName: 'capability_id' },
  },
});
