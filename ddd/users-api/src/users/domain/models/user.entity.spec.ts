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
import { UserCreatedEvent } from '../events/user-created.event';
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
        expect((err as InvalidUsernameException).minLength).toBe(3);
        expect((err as InvalidUsernameException).actualValue).toBe('Al');
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
        expect((err as InvalidDepartmentException).minLength).toBe(3);
        expect((err as InvalidDepartmentException).actualValue).toBe('IT');
      }
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
      const user = User.create('Alice', 'alice@example.test');
      const updatedUser = user.update({
        username: 'Bob',
        department: 'Operations',
      });

      expect(updatedUser.username).toBe('Bob');
      expect(updatedUser.department).toBe('Operations');
      expect(user.getUncommittedEvents()).toHaveLength(2);
      expect(user.getUncommittedEvents()[1]).toBeInstanceOf(UserUpdatedEvent);
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
});
