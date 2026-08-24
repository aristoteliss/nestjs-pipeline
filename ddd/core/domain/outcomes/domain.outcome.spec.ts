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

import { describe, expect, it } from 'vitest';
import { DomainEvent } from '../events/domain.event';
import { DomainOutcome } from './domain.outcome';
import { RootDomainOutcome } from './root-domain.outcome';

class SampleEvent extends DomainEvent {
  constructor(id?: string) {
    super(id);
  }
}

class TestOutcome extends DomainOutcome {
  constructor(events?: DomainEvent[]) {
    super(events);
  }
}

class UserOutcome extends RootDomainOutcome<{ id: string }> {
  constructor(entity: { id: string }, events?: DomainEvent[]) {
    super(entity, events);
  }
}

describe('DomainOutcome & RootDomainOutcome', () => {
  it('initializes with empty events array when not provided', () => {
    const outcome = new TestOutcome();
    expect(outcome.events).toEqual([]);
  });

  it('collects domain events', () => {
    const e1 = new SampleEvent();
    const e2 = new SampleEvent();
    const outcome = new TestOutcome([e1, e2]);

    expect(outcome.events).toHaveLength(2);
    expect(outcome.events[0]).toBe(e1);
  });

  it('RootDomainOutcome holds both entity and events', () => {
    const entity = { id: 'u1' };
    const event = new SampleEvent();
    const outcome = new UserOutcome(entity, [event]);

    expect(outcome.entity).toBe(entity);
    expect(outcome.events).toEqual([event]);
  });
});

