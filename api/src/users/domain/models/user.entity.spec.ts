/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { uuidv7 } from '@cqrs-ddd/uuidv7';
import { describe, expect, it } from 'vitest';
import { UserCreatedEvent } from '../events/user-created.event';
import { UserDeletedEvent } from '../events/user-deleted.event';
import { UserUpdatedEvent } from '../events/user-updated.event';
import {
  EmptyUserUpdateException,
  InvalidDepartmentException,
  InvalidUsernameException,
} from './errors';
import { User } from './user.entity';

describe('User domain entity', () => {
  describe('validation on create', () => {
    it('creates a valid user with username, email, and optional department', () => {
      const user = User.create('Alice', 'alice@example.test', 'Engineering');
      expect(user.username).toBe('Alice');
      expect(user.email).toBe('alice@example.test');
      expect(user.department).toBe('Engineering');
      expect(user.getUncommittedEvents()).toHaveLength(1);
      expect(user.getUncommittedEvents()[0]).toBeInstanceOf(UserCreatedEvent);
    });

    it('creates a valid user with null or omitted department', () => {
      const user1 = User.create('Alice', 'alice@example.test');
      expect(user1.department).toBeNull();

      const user2 = User.create('Alice', 'alice@example.test', null);
      expect(user2.department).toBeNull();

      const user3 = User.create('Alice', 'alice@example.test', '   ');
      expect(user3.department).toBeNull();
    });

    it('throws InvalidUsernameException when username is empty or whitespace', () => {
      expect(() => User.create('', 'alice@example.test')).toThrow(
        InvalidUsernameException,
      );
      expect(() => User.create('   ', 'alice@example.test')).toThrow(
        InvalidUsernameException,
      );
    });

    it('throws InvalidUsernameException when username is shorter than 3 characters', () => {
      expect(() => User.create('Al', 'alice@example.test')).toThrow(
        InvalidUsernameException,
      );
      try {
        User.create('Al', 'alice@example.test');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidUsernameException);
        expect((err as InvalidUsernameException).violation).toEqual({
          field: 'username',
          rule: 'minLength',
          limit: 3,
        });
      }
    });

    it('throws InvalidDepartmentException when department is shorter than 3 characters', () => {
      expect(() => User.create('Alice', 'alice@example.test', 'IT')).toThrow(
        InvalidDepartmentException,
      );
      try {
        User.create('Alice', 'alice@example.test', 'IT');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidDepartmentException);
        expect((err as InvalidDepartmentException).violation).toEqual({
          field: 'department',
          rule: 'minLength',
          limit: 3,
        });
      }
    });

    it('rejects a username or department longer than its 255-character column', () => {
      const long = 'a'.repeat(256);

      expect(() => User.create(long, 'alice@example.test')).toThrow(
        'username must be at most 255 characters.',
      );
      expect(() => User.create('Alice', 'alice@example.test', long)).toThrow(
        'department must be at most 255 characters.',
      );
      expect(User.create('a'.repeat(255), 'alice@example.test').username).toBe(
        'a'.repeat(255),
      );
    });

    it('rejects a username with a control character', () => {
      expect(() => User.create('Ali\u0000ce', 'alice@example.test')).toThrow(
        InvalidUsernameException,
      );
    });
  });

  describe('User update', () => {
    it('rejects a domain-level no-op with EmptyUserUpdateException without changing updatedAt', () => {
      const user = User.create('Alice', 'alice@example.test');
      const before = user.updatedAt;

      expect(() => user.update({})).toThrow(EmptyUserUpdateException);
      expect(() => user.update({})).toThrow('At least one user field');
      expect(user.updatedAt.getTime()).toBe(before.getTime());
    });

    it('updates username and department when valid fields are supplied', () => {
      const past = new Date(Date.now() - 60000);
      const user = User.fromJSON({
        id: uuidv7(),
        username: 'Alice',
        email: 'alice@example.test',
        department: null,
        createdAt: past,
        updatedAt: past,
        version: 1,
      });

      const result = user.update({
        username: 'Bob',
        department: 'Operations',
      });

      expect(result).toBe(user);
      expect(user.username).toBe('Bob');
      expect(user.getExpectedVersion()).toBe(1);
      expect(user.version).toBe(2);
      expect(user.updatedAt.getTime()).toBeGreaterThan(past.getTime());

      expect(user.getUncommittedEvents()).toHaveLength(1);
      const updateEvent = user.getUncommittedEvents()[0] as UserUpdatedEvent;
      expect(updateEvent).toBeInstanceOf(UserUpdatedEvent);
      expect(updateEvent.aggregateVersion).toBe(2);
      expect(updateEvent.payload.version).toBe(2);
      expect(updateEvent.payload.updatedAt).toEqual(user.updatedAt);
    });

    it('preserves earlier event snapshot across consecutive mutations', () => {
      const user = User.create('Alice', 'alice@example.test');
      user.update({ username: 'Bob' });
      user.update({ username: 'Charlie' });

      expect(user.version).toBe(3);
      expect(user.getExpectedVersion()).toBe(1);
      const events = user.getUncommittedEvents();
      expect(events).toHaveLength(3);

      const firstUpdate = events[1] as UserUpdatedEvent;
      const secondUpdate = events[2] as UserUpdatedEvent;
      expect(firstUpdate.payload.version).toBe(2);
      expect(firstUpdate.payload.username).toBe('Bob');
      expect(secondUpdate.payload.version).toBe(3);
      expect(secondUpdate.payload.username).toBe('Charlie');
    });

    it('throws InvalidUsernameException when updating to an invalid username', () => {
      const user = User.create('Alice', 'alice@example.test');
      expect(() => user.update({ username: 'ab' })).toThrow(
        InvalidUsernameException,
      );
    });

    it('throws InvalidDepartmentException when updating to an invalid department', () => {
      const user = User.create('Alice', 'alice@example.test');
      expect(() => user.update({ department: 'ab' })).toThrow(
        InvalidDepartmentException,
      );
    });

    it('does not mutate state or emit events when any field validation fails', () => {
      const user = User.create('Alice', 'alice@example.test', 'Engineering');
      const eventsCount = user.getUncommittedEvents().length;

      expect(() =>
        user.update({ username: 'ValidNewName', department: 'x' }),
      ).toThrow(InvalidDepartmentException);

      expect(user.username).toBe('Alice');
      expect(user.department).toBe('Engineering');
      expect(user.getUncommittedEvents()).toHaveLength(eventsCount);
    });
  });

  describe('delete', () => {
    it('records UserDeletedEvent and increments version', () => {
      const past = new Date(Date.now() - 60000);
      const user = User.fromJSON({
        id: uuidv7(),
        username: 'Alice',
        email: 'alice@example.test',
        department: null,
        createdAt: past,
        updatedAt: past,
        version: 1,
      });

      const result = user.delete();

      expect(result).toBe(user);
      expect(user.version).toBe(2);
      expect(user.getExpectedVersion()).toBe(1);
      expect(user.updatedAt.getTime()).toBeGreaterThan(past.getTime());
      const events = user.getUncommittedEvents();
      expect(events).toHaveLength(1);
      const deleteEvent = events[0] as UserDeletedEvent;
      expect(deleteEvent).toBeInstanceOf(UserDeletedEvent);
      expect(deleteEvent.aggregateVersion).toBe(2);
      expect(deleteEvent.aggregateId).toBe(user.id);
      expect(deleteEvent.payload.version).toBe(2);
      expect(deleteEvent.payload.updatedAt).toEqual(user.updatedAt);
    });
  });

  describe('fromJSON', () => {
    it('reconstructs an entity from snapshot', () => {
      const id = uuidv7();
      const user = User.fromJSON({
        id,
        username: 'Alice',
        email: 'alice@example.test',
        department: 'Sales',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      });

      expect(user.id).toBe(id);
      expect(user.username).toBe('Alice');
      expect(user.department).toBe('Sales');
    });

    it('throws InvalidUsernameException on invalid snapshot username', () => {
      const id = uuidv7();
      expect(() =>
        User.fromJSON({
          id,
          username: 'a',
          email: 'alice@example.test',
        }),
      ).toThrow(InvalidUsernameException);
    });
  });

  describe('field invariants on update', () => {
    it('rejects an empty, blank or short username and trims a valid one', () => {
      const user = User.create('Alice', 'alice@example.test');

      expect(() => user.update({ username: '' })).toThrow(
        InvalidUsernameException,
      );
      expect(() => user.update({ username: '   ' })).toThrow(
        InvalidUsernameException,
      );
      expect(() => user.update({ username: 'Al' })).toThrow(
        InvalidUsernameException,
      );

      user.update({ username: '  Bob  ' });
      expect(user.username).toBe('Bob');
    });

    it('rejects a short department, clears a blank or null one and trims a valid one', () => {
      const user = User.create('Alice', 'alice@example.test', 'Engineering');

      expect(() => user.update({ department: 'ab' })).toThrow(
        InvalidDepartmentException,
      );

      user.update({ department: '   ' });
      expect(user.department).toBeNull();

      user.update({ department: '  Finance  ' });
      expect(user.department).toBe('Finance');

      user.update({ department: null });
      expect(user.department).toBeNull();
    });
  });
});
