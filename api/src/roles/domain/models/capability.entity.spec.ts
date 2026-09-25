/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { uuidv7 } from '@cqrs-ddd/uuidv7';
import { describe, expect, it } from 'vitest';
import { Capability } from './capability.entity';

describe('Capability entity', () => {
  it('creates a capability and serializes it to JSON', () => {
    const cap = new Capability({
      action: 'read',
      subject: 'Document',
      conditions: '{"status":"published"}',
      inverted: false,
      reason: 'Allowed to view published docs',
      fields: 'title,body',
    });

    expect(cap.action).toBe('read');
    expect(cap.subject).toBe('Document');
    expect(cap.conditions).toBe('{"status":"published"}');
    expect(cap.inverted).toBe(false);
    expect(cap.reason).toBe('Allowed to view published docs');
    expect(cap.fields).toBe('title,body');

    const json = cap.toJSON();
    expect(json.id).toBe(cap.id);
    expect(json.action).toBe('read');
    expect(json.subject).toBe('Document');
    expect(json.conditions).toBe('{"status":"published"}');
    expect(json.inverted).toBe(false);
    expect(json.reason).toBe('Allowed to view published docs');
    expect(json.fields).toBe('title,body');
  });

  it('rehydrates a capability from a persisted snapshot', () => {
    const id = uuidv7();
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');

    const snapshot = {
      id,
      action: 'delete',
      subject: 'Post',
      conditions: null,
      inverted: true,
      reason: 'Denied',
      fields: null,
      createdAt,
      updatedAt,
    };

    const cap = new Capability(snapshot);
    expect(cap).toBeInstanceOf(Capability);
    expect(cap.id).toBe(id);
    expect(cap.action).toBe('delete');
    expect(cap.subject).toBe('Post');
    expect(cap.inverted).toBe(true);
    expect(cap.reason).toBe('Denied');
    expect(cap.createdAt).toEqual(createdAt);
    expect(cap.updatedAt).toEqual(updatedAt);
  });
});
