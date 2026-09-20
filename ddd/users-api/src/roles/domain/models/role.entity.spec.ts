/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { uuidv7 } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { RoleCreatedEvent } from '../events/role-created.event';
import { RoleDeletedEvent } from '../events/role-deleted.event';
import { RoleUpdatedEvent } from '../events/role-updated.event';
import { InvalidRoleNameException } from './errors/role-name.exception';
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
      expect((events[0] as RoleCreatedEvent).aggregateId).toBe(role.id);
    });

    it('throws when role name is empty or less than 3 characters', () => {
      expect(() => Role.create('')).toThrow(InvalidRoleNameException);
      expect(() => Role.create('  ')).toThrow(InvalidRoleNameException);
      expect(() => Role.create('ab')).toThrow(InvalidRoleNameException);
      expect(() => Role.create('')).toThrow(
        'Role name must be at least 3 characters.',
      );
    });
  });

  describe('rename', () => {
    it('renames role, updates updatedAt, and records RoleUpdatedEvent', () => {
      const role = Role.create('Editor');
      const initialUpdatedAt = role.updatedAt;

      role.rename('Publisher');

      expect(role.name).toBe('Publisher');
      expect(role.updatedAt.getTime()).toBeGreaterThanOrEqual(
        initialUpdatedAt.getTime(),
      );

      const events = role.getUncommittedEvents();
      expect(events).toHaveLength(2);
      expect(events[0]).toBeInstanceOf(RoleCreatedEvent);
      expect(events[1]).toBeInstanceOf(RoleUpdatedEvent);
      const updateEvent = events[1] as RoleUpdatedEvent;
      expect(updateEvent.aggregateId).toBe(role.id);
      expect(role.version).toBe(2);
      expect(updateEvent.aggregateVersion).toBe(2);
      expect(updateEvent.payload.version).toBe(2);
      expect(updateEvent.payload.updatedAt).toEqual(role.updatedAt);
    });

    it('throws when renaming to invalid name', () => {
      const role = Role.create('Editor');
      expect(() => role.rename('x')).toThrow(InvalidRoleNameException);
      expect(() => role.rename('x')).toThrow(
        'Role name must be at least 3 characters.',
      );
    });
  });

  describe('delete', () => {
    it('records RoleDeletedEvent and updates updatedAt', () => {
      const role = Role.create('Viewer');
      const initialUpdatedAt = role.updatedAt;

      role.delete();

      expect(role.updatedAt.getTime()).toBeGreaterThanOrEqual(
        initialUpdatedAt.getTime(),
      );
      expect(role.version).toBe(2);
      const events = role.getUncommittedEvents();
      expect(events).toHaveLength(2);
      expect(events[1]).toBeInstanceOf(RoleDeletedEvent);
      const deleteEvent = events[1] as RoleDeletedEvent;
      expect(deleteEvent.aggregateId).toBe(role.id);
      expect(deleteEvent.aggregateVersion).toBe(2);
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

  describe('name setter domain encapsulation and invariants', () => {
    it('enforces invariants and normalization on name setter', () => {
      const role = Role.create('Developer');

      expect(() => {
        role.name = '';
      }).toThrow(InvalidRoleNameException);

      expect(() => {
        role.name = '  ';
      }).toThrow(InvalidRoleNameException);

      expect(() => {
        role.name = 'ab';
      }).toThrow(InvalidRoleNameException);

      role.name = '  Lead Developer  ';
      expect(role.name).toBe('Lead Developer');
    });
  });
});
