/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntitySchema } from '@mikro-orm/core';
import { AggregateRoot } from '@nestjs-pipeline/ddd-core/domain';
import { rootEntityProperties } from '@nestjs-pipeline/ddd-core/persistence';
import { Capability } from '../../roles/domain/models/capability.entity';

export const CapabilitySchema = new EntitySchema<Capability, AggregateRoot>({
  class: Capability,
  tableName: 'capabilities',
  properties: {
    ...rootEntityProperties(),
    action: { type: 'string' },
    subject: { type: 'string' },
    conditions: { type: 'string', nullable: true },
    inverted: { type: 'boolean', default: false },
    reason: { type: 'string', nullable: true },
    fields: { type: 'string', nullable: true },
  },
});
