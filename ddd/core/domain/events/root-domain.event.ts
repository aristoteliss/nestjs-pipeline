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

import { RootEntitySnapshot } from '../interfaces/root-entity-snapshot.interface';
import { RootEntity } from '../models/root.entity';
import { DomainEvent } from './domain.event';

/**
 * A {@link DomainEvent} that carries the aggregate root affected by the event
 * along with an immutable state payload snapshot captured at event creation time.
 *
 * Capturing an immutable snapshot protects asynchronous event consumers from
 * subsequent in-memory mutations on the aggregate root instance.
 *
 * @typeParam T - The entity (aggregate root) type attached to the event.
 * @typeParam TPayload - The snapshot payload type.
 */
export class RootDomainEvent<
  T = RootEntity<Partial<RootEntitySnapshot>>,
  TPayload = unknown,
> extends DomainEvent {
  public readonly entity: T;
  public readonly payload: Readonly<TPayload>;

  protected constructor(entity: T, payload?: TPayload) {
    super();
    this.entity = entity;
    if (payload !== undefined) {
      this.payload = Object.freeze(payload);
    } else if (
      entity &&
      typeof (entity as { toJSON?: () => unknown }).toJSON === 'function'
    ) {
      this.payload = (
        entity as unknown as { toJSON: () => TPayload }
      ).toJSON();
    } else if (entity && typeof entity === 'object') {
      this.payload = Object.freeze({ ...entity }) as Readonly<TPayload>;
    } else {
      this.payload = Object.freeze({}) as Readonly<TPayload>;
    }
  }
}
