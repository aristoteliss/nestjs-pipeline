/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntitySchema } from '@mikro-orm/core';
import { UserAdditionalCapability } from '../entities/user-additional-capability.entity';

export const UserAdditionalCapabilitySchema =
  new EntitySchema<UserAdditionalCapability>({
    class: UserAdditionalCapability,
    tableName: 'user_additional_capabilities',
    properties: {
      userId: { type: 'string', primary: true, fieldName: 'user_id' },
      capabilityId: {
        type: 'string',
        primary: true,
        fieldName: 'capability_id',
      },
    },
  });
