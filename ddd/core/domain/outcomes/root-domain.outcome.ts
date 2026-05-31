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

import { DomainEvent } from '../events/domain.event';
import { RootEntitySnapshot } from '../interfaces/root-entity-snapshot.interface';
import { RootEntity } from '../models/root.entity';
import { DomainOutcome } from './domain.outcome';

/**
 * A {@link DomainOutcome} that also exposes the aggregate root it produced.
 *
 * Returned by command handlers so the base handler can publish the collected
 * domain events while callers still get access to the resulting entity.
 *
 * @typeParam T - The entity (aggregate root) type carried by the outcome.
 */
export abstract class RootDomainOutcome<
  T = RootEntity<Partial<RootEntitySnapshot>>,
> extends DomainOutcome {
  public readonly entity: T;

  protected constructor(entity: T, events?: Array<DomainEvent>) {
    super(events);
    this.entity = entity;
  }
}
