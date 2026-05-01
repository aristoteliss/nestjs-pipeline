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
import { Auth } from '../../auths/domain/models/auth.entity';

export const AuthSchema = new EntitySchema<Auth>({
  // @ts-expect-error MikroORM requires a public constructor
  class: Auth,
  tableName: 'auth',
  properties: {
    // @ts-expect-error Maps to private property from RootEntity
    _id: { type: 'string', primary: true, fieldName: 'id' },
    _createdAt: { type: 'number', fieldName: 'created_at' },
    _updatedAt: { type: 'number', fieldName: 'updated_at' },
    userId: { type: 'string', fieldName: 'user_id' },
    tenantId: { type: 'string', fieldName: 'tenant_id', nullable: true },
    token: { type: 'string' },
    prefixKey: { type: 'string', persist: false },
  },
});
