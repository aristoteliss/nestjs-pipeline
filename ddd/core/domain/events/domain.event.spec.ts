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
import { DomainEvent } from './domain.event';
import { RootDomainEvent } from './root-domain.event';

class CustomDomainEvent extends DomainEvent {
  constructor(public readonly detail: string, id?: string) {
    super(id);
  }
}

class UserCreatedEvent extends RootDomainEvent<{ id: string; name: string }> {
  constructor(entity: { id: string; name: string }) {
    super(entity);
  }
}

describe('DomainEvent & RootDomainEvent', () => {
  it('generates a UUIDv7 event id when none is provided', () => {
    const event = new CustomDomainEvent('something happened');
    expect(event.id).toBeDefined();
    expect(event.detail).toBe('something happened');
  });

  it('preserves custom event id when provided', () => {
    const customId = '018f0000-0000-7000-8000-000000000000';
    const event = new CustomDomainEvent('custom', customId);
    expect(event.id).toBe(customId);
  });

  it('RootDomainEvent carries attached entity', () => {
    const entity = { id: 'user-1', name: 'Alice' };
    const event = new UserCreatedEvent(entity);

    expect(event.entity).toBe(entity);
    expect(event.id).toBeDefined();
  });
});

