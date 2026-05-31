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
import { RoleCapability } from '../entities/role-capability.entity';

export const RoleCapabilitySchema = new EntitySchema<RoleCapability>({
  class: RoleCapability,
  tableName: 'role_capabilities',
  properties: {
    roleId: { type: 'string', primary: true, fieldName: 'role_id' },
    capabilityId: { type: 'string', primary: true, fieldName: 'capability_id' },
  },
});
