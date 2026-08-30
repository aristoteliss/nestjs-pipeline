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

/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: false possitive */
import { describe, expect, it } from 'vitest';
import {
  capabilitiesToRawRules,
  capabilityToRawRule,
  interpolateConditions,
  normalizeCapability,
  parseCapabilityString,
  serializeCapability,
} from './helpers/capability.helpers';
import type { Capability, CaslUserContext } from './types/casl.types';

describe('capability.helpers', () => {
  describe('parseCapabilityString', () => {
    it('should parse simple subject|action|* format', () => {
      const result = parseCapabilityString('Post|read|*');
      expect(result).toEqual({ subject: 'Post', action: 'read' });
    });

    it('should parse "all" subject directly', () => {
      const result = parseCapabilityString('all|read|*');
      expect(result).toEqual({ subject: 'all', action: 'read' });
    });

    it('should parse "manage" action directly', () => {
      const result = parseCapabilityString('Post|manage|*');
      expect(result).toEqual({ subject: 'Post', action: 'manage' });
    });

    it('should handle full wildcard all|manage|*', () => {
      const result = parseCapabilityString('all|manage|*');
      expect(result).toEqual({ subject: 'all', action: 'manage' });
    });

    it('should parse inverted rules with ! prefix', () => {
      const result = parseCapabilityString('!Post|delete|*');
      expect(result).toEqual({
        subject: 'Post',
        action: 'delete',
        inverted: true,
      });
    });

    it('should parse conditions JSON', () => {
      const result = parseCapabilityString('Post|update|{"authorId":"${id}"}');
      expect(result).toEqual({
        subject: 'Post',
        action: 'update',
        conditions: { authorId: '${id}' },
      });
    });

    it('should throw on missing action', () => {
      expect(() => parseCapabilityString('Post')).toThrow('missing action');
    });

    it('should throw on empty subject', () => {
      expect(() => parseCapabilityString('|read|*')).toThrow('missing subject');
    });

    it('should throw on empty action', () => {
      expect(() => parseCapabilityString('Post||*')).toThrow('missing action');
    });

    it('should reject undocumented trailing segments', () => {
      expect(() => parseCapabilityString('Post|read|*|title|ignored')).toThrow(
        'too many segments',
      );
    });

    it('should throw on malformed conditions JSON', () => {
      expect(() => parseCapabilityString('Post|read|{invalid json}')).toThrow(
        'Invalid conditions JSON',
      );
    });

    it.each(['null', 'false', '0', '""', '[]', '[{"tenantId":"x"}]'])(
      'should reject non-object conditions JSON: %s',
      (conditions) => {
        expect(() =>
          parseCapabilityString(`Post|update|${conditions}`),
        ).toThrow('must be a JSON object');
      },
    );

    it('should parse fields from 4th segment', () => {
      const result = parseCapabilityString('Post|update|*|title,body');
      expect(result).toEqual({
        subject: 'Post',
        action: 'update',
        fields: ['title', 'body'],
      });
    });

    it('should parse fields with conditions', () => {
      const result = parseCapabilityString(
        'Post|update|{"authorId":"${id}"}|title,body',
      );
      expect(result).toEqual({
        subject: 'Post',
        action: 'update',
        conditions: { authorId: '${id}' },
        fields: ['title', 'body'],
      });
    });

    it('should treat * fields as all fields (omitted)', () => {
      const result = parseCapabilityString('Post|read|*|*');
      expect(result).toEqual({ subject: 'Post', action: 'read' });
    });
  });

  describe('normalizeCapability', () => {
    it('should parse strings', () => {
      const result = normalizeCapability('Post|read|*');
      expect(result).toEqual({ subject: 'Post', action: 'read' });
    });

    it('should return objects as-is', () => {
      const cap: Capability = { subject: 'Post', action: 'read' };
      expect(normalizeCapability(cap)).toBe(cap);
    });

    it('should reject invalid object-form conditions at runtime', () => {
      expect(() =>
        normalizeCapability({
          subject: 'Post',
          action: 'update',
          conditions: null,
        } as unknown as Capability),
      ).toThrow('must be a JSON object');
    });

    it.each([new Map(), new Set(), new Date(), /pattern/])(
      'should reject non-plain condition objects: %s',
      (conditions) => {
        expect(() =>
          normalizeCapability({
            subject: 'Post',
            action: 'update',
            conditions,
          } as unknown as Capability),
        ).toThrow('must be a JSON object');
      },
    );
  });

  describe('serializeCapability', () => {
    it('should serialize basic capability', () => {
      expect(serializeCapability({ subject: 'Post', action: 'read' })).toBe(
        'Post|read|*',
      );
    });

    it('should fail closed for malformed runtime conditions', () => {
      expect(() =>
        serializeCapability({
          subject: 'Post',
          action: 'update',
          conditions: [],
        } as unknown as Capability),
      ).toThrow('must be a JSON object');
    });

    it('should reject recursively non-JSON condition values', () => {
      expect(() =>
        serializeCapability({
          subject: 'Post',
          action: 'update',
          conditions: { nested: new Map() },
        } as unknown as Capability),
      ).toThrow('must be a JSON object');
    });

    it('should serialize "manage" directly', () => {
      expect(serializeCapability({ subject: 'Post', action: 'manage' })).toBe(
        'Post|manage|*',
      );
    });

    it('should serialize "all" directly', () => {
      expect(serializeCapability({ subject: 'all', action: 'manage' })).toBe(
        'all|manage|*',
      );
    });

    it('should serialize inverted rules with ! prefix', () => {
      expect(
        serializeCapability({
          subject: 'Post',
          action: 'delete',
          inverted: true,
        }),
      ).toBe('!Post|delete|*');
    });

    it('should keep ordinary conditions readable as JSON', () => {
      expect(
        serializeCapability({
          subject: 'Post',
          action: 'update',
          conditions: { authorId: 42 },
        }),
      ).toBe('Post|update|{"authorId":42}');
    });

    it('should serialize fields as comma-separated 4th segment', () => {
      expect(
        serializeCapability({
          subject: 'Post',
          action: 'update',
          fields: ['title', 'body'],
        }),
      ).toBe('Post|update|*|title,body');
    });

    it('should serialize fields with conditions', () => {
      expect(
        serializeCapability({
          subject: 'Post',
          action: 'update',
          conditions: { authorId: 42 },
          fields: ['title'],
        }),
      ).toBe('Post|update|{"authorId":42}|title');
    });

    it('should omit fields segment when no fields', () => {
      expect(serializeCapability({ subject: 'Post', action: 'read' })).toBe(
        'Post|read|*',
      );
    });

    it('should roundtrip parse → serialize', () => {
      const original = 'Post|update|{"authorId":"${id}"}';
      const parsed = parseCapabilityString(original);
      const serialized = serializeCapability(parsed);
      expect(parseCapabilityString(serialized)).toEqual(parsed);
    });

    it('should roundtrip parse → serialize with fields', () => {
      const original = 'Post|update|{"authorId":"${id}"}|title,body';
      const parsed = parseCapabilityString(original);
      const serialized = serializeCapability(parsed);
      expect(parseCapabilityString(serialized)).toEqual(parsed);
    });

    it('roundtrips a condition containing the segment delimiter', () => {
      const capability: Capability = {
        subject: 'Post',
        action: 'read',
        conditions: { code: 'a|b' },
      };

      expect(parseCapabilityString(serializeCapability(capability))).toEqual(
        capability,
      );
    });
  });

  describe('interpolateConditions', () => {
    const user: CaslUserContext = { id: 42, tenantId: 'abc', name: 'Alice' };

    it('should interpolate ${property} placeholders', () => {
      const result = interpolateConditions({ authorId: '${id}' }, user);
      expect(result).toEqual({ authorId: 42 });
    });

    it('should interpolate {{ property }} placeholders', () => {
      const result = interpolateConditions({ authorId: '{{ id }}' }, user);
      expect(result).toEqual({ authorId: 42 });
    });

    it('should handle string interpolation in mixed values', () => {
      const result = interpolateConditions(
        { prefix: 'user-${id}-posts' },
        user,
      );
      expect(result).toEqual({ prefix: 'user-42-posts' });
    });

    it('should handle nested conditions', () => {
      const result = interpolateConditions({ owner: { id: '${id}' } }, user);
      expect(result).toEqual({ owner: { id: 42 } });
    });

    it('should interpolate placeholders with a prefixed root segment', () => {
      const result = interpolateConditions(
        { tenantId: '${user.tenantId}' },
        user,
      );
      expect(result).toEqual({ tenantId: 'abc' });
    });

    it('should reject unknown leading root segments', () => {
      expect(() =>
        interpolateConditions({ tenantId: '${principal.tenantId}' }, user),
      ).toThrow('principal.tenantId');

      expect(() =>
        interpolateConditions({ authorId: '${typo.foo.id}' }, user),
      ).toThrow('typo.foo.id');
    });

    it('should interpolate nested placeholders with a prefixed root segment', () => {
      const result = interpolateConditions(
        { owner: { tenantId: '${user.tenantId}' } },
        user,
      );
      expect(result).toEqual({ owner: { tenantId: 'abc' } });
    });

    it('should pass through non-string values', () => {
      const result = interpolateConditions(
        { status: true, count: 5, tags: ['a', 'b'] },
        user,
      );
      expect(result).toEqual({ status: true, count: 5, tags: ['a', 'b'] });
    });

    it('should interpolate placeholders recursively inside arrays', () => {
      const result = interpolateConditions(
        {
          tenantId: {
            $in: ['${user.tenantId}', 'public'],
            $nin: ['blocked-${id}'],
          },
        },
        user,
      );

      expect(result).toEqual({
        tenantId: {
          $in: ['abc', 'public'],
          $nin: ['blocked-42'],
        },
      });
    });

    it('should throw when a placeholder cannot be resolved', () => {
      expect(() =>
        interpolateConditions({ department: '${department}' }, user),
      ).toThrow('department');
    });

    it('should throw when a placeholder inside a mixed string is missing', () => {
      expect(() =>
        interpolateConditions({ prefix: 'team-${department}' }, user),
      ).toThrow('department');
    });

    it('preserves an own __proto__ condition as ordinary data', () => {
      const conditions = JSON.parse(
        '{"__proto__":{"tenantId":"${user.tenantId}"}}',
      ) as Record<string, unknown>;
      const result = interpolateConditions(conditions, user);

      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(Object.hasOwn(result, '__proto__')).toBe(true);
      expect(Reflect.get(result, '__proto__')).toEqual({ tenantId: 'abc' });
    });

    it('does not resolve inherited placeholder properties', () => {
      expect(() =>
        interpolateConditions({ value: '${constructor}' }, user),
      ).toThrow('constructor');
      expect(() =>
        interpolateConditions({ value: '${toString}' }, user),
      ).toThrow('toString');
    });
  });

  describe('capabilityToRawRule', () => {
    it('should convert basic capability to raw rule', () => {
      const rule = capabilityToRawRule({ subject: 'Post', action: 'read' });
      expect(rule).toEqual({ action: 'read', subject: 'Post' });
    });

    it('should include inverted flag', () => {
      const rule = capabilityToRawRule({
        subject: 'Post',
        action: 'delete',
        inverted: true,
      });
      expect(rule.inverted).toBe(true);
    });

    it('should include fields', () => {
      const rule = capabilityToRawRule({
        subject: 'Post',
        action: 'update',
        fields: ['title', 'content'],
      });
      expect(rule.fields).toEqual(['title', 'content']);
    });

    it('should include reason', () => {
      const rule = capabilityToRawRule({
        subject: 'Post',
        action: 'delete',
        inverted: true,
        reason: 'Posts cannot be deleted',
      });
      expect(rule.reason).toBe('Posts cannot be deleted');
    });

    it('should interpolate conditions when user is provided', () => {
      const rule = capabilityToRawRule(
        {
          subject: 'Post',
          action: 'update',
          conditions: { authorId: '${id}' },
        },
        { id: 42 },
      );
      expect(rule.conditions).toEqual({ authorId: 42 });
    });

    it('should interpolate ${user.property} conditions when user is provided', () => {
      const rule = capabilityToRawRule(
        {
          subject: 'User',
          action: 'manage',
          conditions: { tenantId: '${user.tenantId}' },
        },
        { id: 42, tenantId: 'abc' },
      );
      expect(rule.conditions).toEqual({ tenantId: 'abc' });
    });

    it('should keep raw conditions when no user is provided', () => {
      const rule = capabilityToRawRule({
        subject: 'Post',
        action: 'update',
        conditions: { authorId: '${id}' },
      });
      expect(rule.conditions).toEqual({ authorId: '${id}' });
    });
  });

  describe('capabilitiesToRawRules', () => {
    it('should convert mixed strings and objects', () => {
      const rules = capabilitiesToRawRules([
        'Post|read|*',
        { subject: 'Post', action: 'create' },
      ]);
      expect(rules).toHaveLength(2);
      expect(rules[0]).toEqual({ action: 'read', subject: 'Post' });
      expect(rules[1]).toEqual({ action: 'create', subject: 'Post' });
    });

    it('should order direct rules before inverted rules', () => {
      const rules = capabilitiesToRawRules(['!Post|delete|*', 'Post|read|*']);
      expect(rules[0].inverted).toBeUndefined();
      expect(rules[0].action).toBe('read');
      expect(rules[1].inverted).toBe(true);
      expect(rules[1].action).toBe('delete');
    });

    it('should interpolate conditions for all rules', () => {
      const user: CaslUserContext = { id: 7 };
      const rules = capabilitiesToRawRules(
        ['Post|update|{"authorId":"${id}"}'],
        user,
      );
      expect(rules[0].conditions).toEqual({ authorId: 7 });
    });
  });
});
