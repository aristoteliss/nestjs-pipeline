/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntitySchema } from '@mikro-orm/core';
import { AggregateRoot, UnixTimestampType } from '@nestjs-pipeline/ddd-core';
import { Capability } from '../../roles/domain/models/capability.entity';

export const CapabilitySchema = new EntitySchema<Capability, AggregateRoot>({
  class: Capability,
  tableName: 'capabilities',
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
    action: { type: 'string' },
    subject: { type: 'string' },
    conditions: { type: 'string', nullable: true },
    inverted: { type: 'boolean', default: false },
    reason: { type: 'string', nullable: true },
    fields: { type: 'string', nullable: true },
  },
});
