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
import { CreatedAuthEvent } from '../events/create-auth.event';
import { Auth } from './auth.entity';

describe('Auth domain entity', () => {
  describe('creation', () => {
    it('creates an Auth entity and applies CreatedAuthEvent', () => {
      const userId = uuidv7();
      const token = 'jwt.mock.token';
      const auth = Auth.create(userId, token);

      expect(auth.id).toBeDefined();
      expect(auth.userId).toBe(userId);
      expect(auth.token).toBe(token);
      expect(auth.createdAt).toBeInstanceOf(Date);
      expect(auth.updatedAt).toBeInstanceOf(Date);

      const events = auth.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(CreatedAuthEvent);
      expect((events[0] as CreatedAuthEvent).entity).toBe(auth);
    });
  });

  describe('fromJSON and toJSON', () => {
    it('reconstructs entity without uncommitted events', () => {
      const id = uuidv7();
      const userId = uuidv7();
      const token = 'persisted.token';
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');

      const auth = Auth.fromJSON({
        id,
        userId,
        token,
        createdAt,
        updatedAt,
      });

      expect(auth.id).toBe(id);
      expect(auth.userId).toBe(userId);
      expect(auth.token).toBe(token);
      expect(auth.createdAt).toEqual(createdAt);
      expect(auth.updatedAt).toEqual(updatedAt);
      expect(auth.getUncommittedEvents()).toHaveLength(0);
    });

    it('serializes to frozen snapshot via toJSON', () => {
      const auth = Auth.create('user-1', 'token-123');
      const json = auth.toJSON();

      expect(json.id).toBe(auth.id);
      expect(json.userId).toBe('user-1');
      expect(json.token).toBe('token-123');
      expect(json.createdAt).toEqual(auth.createdAt);
      expect(json.updatedAt).toEqual(auth.updatedAt);
      expect(Object.isFrozen(json)).toBe(true);
    });
  });
});
