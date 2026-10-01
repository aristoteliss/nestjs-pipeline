/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntitySchema } from '@mikro-orm/core';
import { UserDeniedCapability } from '../entities/user-denied-capability.entity.js';

export const UserDeniedCapabilitySchema =
  new EntitySchema<UserDeniedCapability>({
    class: UserDeniedCapability,
    tableName: 'user_denied_capabilities',
    properties: {
      userId: {
        type: 'string',
        length: 64,
        primary: true,
        fieldName: 'user_id',
      },
      capabilityId: {
        type: 'string',
        length: 64,
        primary: true,
        fieldName: 'capability_id',
      },
    },
  });
