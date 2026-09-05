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

import { uuidv7 } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { RoleCreatedEvent } from '../events/role-created.event';
import { RoleDeletedEvent } from '../events/role-deleted.event';
import { RoleUpdatedEvent } from '../events/role-updated.event';
import { Role } from './role.entity';

describe('Role domain entity', () => {
  describe('creation', () => {
    it('creates a valid role and records RoleCreatedEvent', () => {
      const role = Role.create('Administrator');

      expect(role.name).toBe('Administrator');
      expect(role.id).toBeDefined();
      expect(role.createdAt).toBeInstanceOf(Date);
      expect(role.updatedAt).toBeInstanceOf(Date);

      const events = role.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(RoleCreatedEvent);
      expect((events[0] as RoleCreatedEvent).entity).toBe(role);
    });

    it('throws when role name is empty or less than 3 characters', () => {
      expect(() => Role.create('')).toThrow('Role name must be at least 3 characters.');
      expect(() => Role.create('  ')).toThrow('Role name must be at least 3 characters.');
      expect(() => Role.create('ab')).toThrow('Role name must be at least 3 characters.');
    });
  });

  describe('rename', () => {
    it('renames role, updates updatedAt, and records RoleUpdatedEvent', () => {
      const role = Role.create('Editor');
      const initialUpdatedAt = role.updatedAt;

      const updated = role.rename('Publisher');

      expect(updated.name).toBe('Publisher');
      expect(role.name).toBe('Publisher');
      expect(role.updatedAt.getTime()).toBeGreaterThanOrEqual(initialUpdatedAt.getTime());

      const events = role.getUncommittedEvents();
      expect(events).toHaveLength(2);
      expect(events[0]).toBeInstanceOf(RoleCreatedEvent);
      expect(events[1]).toBeInstanceOf(RoleUpdatedEvent);
      expect((events[1] as RoleUpdatedEvent).entity).toBe(role);
    });

    it('throws when renaming to invalid name', () => {
      const role = Role.create('Editor');
      expect(() => role.rename('x')).toThrow('Role name must be at least 3 characters.');
    });
  });

  describe('delete', () => {
    it('records RoleDeletedEvent and updates updatedAt', () => {
      const role = Role.create('Viewer');
      const initialUpdatedAt = role.updatedAt;

      role.delete();

      expect(role.updatedAt.getTime()).toBeGreaterThanOrEqual(initialUpdatedAt.getTime());
      const events = role.getUncommittedEvents();
      expect(events).toHaveLength(2);
      expect(events[1]).toBeInstanceOf(RoleDeletedEvent);
      expect((events[1] as RoleDeletedEvent).entity).toBe(role);
    });
  });

  describe('fromJSON and toJSON', () => {
    it('reconstructs entity without uncommitted events', () => {
      const id = uuidv7();
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');

      const role = Role.fromJSON({
        id,
        name: 'Contributor',
        createdAt,
        updatedAt,
      });

      expect(role.id).toBe(id);
      expect(role.name).toBe('Contributor');
      expect(role.createdAt).toEqual(createdAt);
      expect(role.updatedAt).toEqual(updatedAt);
      expect(role.getUncommittedEvents()).toHaveLength(0);
    });

    it('serializes to frozen snapshot via toJSON', () => {
      const role = Role.create('Manager');
      const json = role.toJSON();

      expect(json.id).toBe(role.id);
      expect(json.name).toBe('Manager');
      expect(json.createdAt).toEqual(role.createdAt);
      expect(json.updatedAt).toEqual(role.updatedAt);
      expect(Object.isFrozen(json)).toBe(true);
    });
  });
});
