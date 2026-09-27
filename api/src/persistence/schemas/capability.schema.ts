/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AggregateRoot } from '@cqrs-ddd/core/domain';
import { rootEntityProperties } from '@cqrs-ddd/mikro-orm';
import { EntitySchema } from '@mikro-orm/core';
import { Capability } from '../../roles/domain/models/capability.entity';

/**
 * MikroORM EntitySchema for {@link Capability}. Capabilities are not written with
 * version checks, so the inherited `version` is mapped without a column.
 */
export const CapabilitySchema = new EntitySchema<Capability, AggregateRoot>({
  class: Capability,
  tableName: 'capabilities',
  properties: {
    ...rootEntityProperties(),
    version: { type: 'number', persist: false },
    action: { type: 'string' },
    subject: { type: 'string' },
    conditions: { type: 'string', nullable: true },
    inverted: { type: 'boolean', default: false },
    reason: { type: 'string', nullable: true },
    fields: { type: 'string', nullable: true },
  },
});
