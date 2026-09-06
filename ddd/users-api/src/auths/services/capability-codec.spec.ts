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
import { CapabilityCodec } from './capability-codec';

describe('CapabilityCodec', () => {
  describe('serializeArray()', () => {
    it('returns undefined for non-array inputs', () => {
      expect(CapabilityCodec.serializeArray(null)).toBeUndefined();
      expect(CapabilityCodec.serializeArray(undefined)).toBeUndefined();
      expect(CapabilityCodec.serializeArray('not-an-array')).toBeUndefined();
      expect(CapabilityCodec.serializeArray(123)).toBeUndefined();
    });

    it('returns undefined for empty arrays', () => {
      expect(CapabilityCodec.serializeArray([])).toBeUndefined();
    });

    it('serializes valid compact strings and capability objects', () => {
      const result = CapabilityCodec.serializeArray([
        'User|read|*',
        {
          subject: 'Role',
          action: 'update',
          conditions: { tenantId: '1' },
          fields: ['name'],
        },
        '!User|delete|*',
      ]);

      expect(result).toEqual([
        'User|read|*',
        'Role|update|{"tenantId":"1"}|name',
        '!User|delete|*',
      ]);
    });

    it('throws TypeError for malformed capability items', () => {
      expect(() => CapabilityCodec.serializeArray([123])).toThrow(TypeError);
      expect(() => CapabilityCodec.serializeArray([null])).toThrow(TypeError);
      expect(() => CapabilityCodec.serializeArray([true])).toThrow(TypeError);
      expect(() =>
        CapabilityCodec.serializeArray([{ subject: '', action: 'read' }]),
      ).toThrow(TypeError);
    });
  });

  describe('toCompact()', () => {
    it('returns empty array when given undefined or empty input', () => {
      expect(CapabilityCodec.toCompact(undefined)).toEqual([]);
      expect(CapabilityCodec.toCompact([])).toEqual([]);
    });

    it('serializes objects and strings into compact strings', () => {
      const result = CapabilityCodec.toCompact([
        { subject: 'User', action: 'create' },
        'Role|manage|*',
      ]);

      expect(result).toEqual(['User|create|*', 'Role|manage|*']);
    });
  });

  describe('compactUserCapabilities()', () => {
    it('returns undefined for non-object or empty payload', () => {
      expect(CapabilityCodec.compactUserCapabilities(null)).toBeUndefined();
      expect(
        CapabilityCodec.compactUserCapabilities(undefined),
      ).toBeUndefined();
      expect(CapabilityCodec.compactUserCapabilities('str')).toBeUndefined();
      expect(CapabilityCodec.compactUserCapabilities({})).toBeUndefined();
      expect(
        CapabilityCodec.compactUserCapabilities({
          roles: [],
          additionalCapabilities: [],
        }),
      ).toBeUndefined();
    });

    it('normalizes roles and capability arrays', () => {
      const payload = {
        roles: ['admin', 'manager', 42], // non-string filtered out
        additionalCapabilities: [
          'User|read|*',
          { subject: 'Report', action: 'export' },
        ],
        deniedCapabilities: ['!User|delete|*'],
      };

      const result = CapabilityCodec.compactUserCapabilities(payload);

      expect(result).toEqual({
        roles: ['admin', 'manager'],
        additionalCapabilities: ['User|read|*', 'Report|export|*'],
        deniedCapabilities: ['!User|delete|*'],
      });
    });

    it('throws on malformed capability elements inside user capabilities', () => {
      expect(() =>
        CapabilityCodec.compactUserCapabilities({
          roles: ['user'],
          additionalCapabilities: [null],
        }),
      ).toThrow(TypeError);
    });
  });
});
