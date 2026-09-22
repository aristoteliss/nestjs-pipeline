/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: false positive */
import { subject } from '@casl/ability';
import { describe, expect, it } from 'vitest';
import type { Capability } from '../types/casl.types';
import { buildAbility } from './ability';
import {
  normalizeCapability,
  parseCapabilityString,
  serializeCapability,
} from './capability';

describe('capability codec', () => {
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
      expect(() =>
        parseCapabilityString('Post|read|*|title|reason|ignored'),
      ).toThrow('too many segments');
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
    it('refuses to turn an owner restriction into an unrestricted grant', () => {
      const capability: Capability = {
        subject: 'User',
        action: 'read',
        conditions: { ownerId: undefined },
      };
      const ability = buildAbility([capability]);
      expect(
        ability.can(
          'read',
          subject('User', { ownerId: 'someone-else' }) as unknown as string,
        ),
      ).toBe(false);
      expect(() => serializeCapability(capability)).toThrow(TypeError);
    });

    it.each([
      ['undefined', undefined],
      ['function', () => true],
      ['symbol', Symbol('owner')],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['bigint', 1n],
      ['Date', new Date('2026-01-01')],
      ['RegExp', /owner/],
      ['Map', new Map()],
      ['Set', new Set()],
      ['sparse array', new Array(1)],
      ['undefined in array', [undefined]],
      ['toJSON override', { ownerId: 'alice', toJSON: () => ({}) }],
      ['symbol key', { [Symbol('owner')]: 'alice' }],
    ])('rejects lossy nested conditions: %s', (_label, value) => {
      expect(() =>
        serializeCapability({
          subject: 'User',
          action: 'read',
          conditions: { nested: value },
        }),
      ).toThrow('must be a JSON object');
    });

    it('preserves authorization decisions for supported nested JSON conditions', () => {
      const capability: Capability = {
        subject: 'User',
        action: 'read',
        conditions: {
          ownerId: 'alice',
          status: { $in: ['active', 'pending'] },
        },
      };
      const decoded = parseCapabilityString(serializeCapability(capability));
      expect(decoded).toEqual(capability);
      const before = buildAbility([capability]);
      const after = buildAbility([decoded]);
      for (const [ownerId, status, allowed] of [
        ['alice', 'active', true],
        ['alice', 'closed', false],
        ['bob', 'active', false],
      ] as const) {
        const entity = subject('User', {
          ownerId,
          status,
        }) as unknown as string;
        expect(before.can('read', entity)).toBe(allowed);
        expect(after.can('read', entity)).toBe(allowed);
      }
    });

    it('rejects cycles but permits repeated references to JSON data', () => {
      const shared = { ownerId: 'alice' };
      const capability: Capability = {
        subject: 'User',
        action: 'read',
        conditions: { $or: [shared, shared] },
      };
      expect(parseCapabilityString(serializeCapability(capability))).toEqual(
        capability,
      );
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      expect(() =>
        serializeCapability({ ...capability, conditions: cyclic }),
      ).toThrow(TypeError);
    });

    it('rejects accessors without evaluating their changing values', () => {
      let reads = 0;
      const conditions = {
        get ownerId() {
          reads += 1;
          return reads === 1 ? 'alice' : undefined;
        },
      };
      expect(() =>
        serializeCapability({ subject: 'User', action: 'read', conditions }),
      ).toThrow(TypeError);
      expect(reads).toBe(0);
    });

    it('rejects non-enumerable restrictions and extra array properties', () => {
      const hidden = Object.defineProperty({}, 'ownerId', { value: 'alice' });
      const array = Object.assign(['alice'], { ownerId: 'bob' });
      for (const conditions of [hidden, { owners: array }]) {
        expect(() =>
          serializeCapability({ subject: 'User', action: 'read', conditions }),
        ).toThrow(TypeError);
      }
    });

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

    it('roundtrips delimiter-bearing segments, empty fields, and reason', () => {
      const capabilities: Capability[] = [
        { subject: 'A|B', action: 'read' },
        { subject: '!Post', action: 'read|own' },
        { subject: 'Post', action: 'read', fields: ['first,last', '*'] },
        { subject: ' Post ', action: '~read', fields: [] },
        {
          subject: 'Post',
          action: 'delete',
          inverted: true,
          reason: 'tenant|policy',
        },
        {
          subject: 'Post',
          action: 'read',
          conditions: {},
          reason: '*',
        },
      ];

      for (const capability of capabilities) {
        expect(parseCapabilityString(serializeCapability(capability))).toEqual(
          capability,
        );
      }
    });
  });

  describe('encoded segment edge cases', () => {
    it('throws when decoded text segment is not a string or has invalid JSON', () => {
      // base64url of "123" is "MTIz", which parses to number 123
      expect(() => parseCapabilityString('~MTIz|read|*')).toThrow(
        /Invalid encoded subject in capability string/,
      );
      // invalid base64 / json
      expect(() => parseCapabilityString('~invalid-base64!|read|*')).toThrow(
        /Invalid encoded subject in capability string/,
      );
    });

    it('throws when decoded fields segment is not a string array or has invalid JSON', () => {
      // base64url of "[123]" is "WzEyM10", which contains non-string items
      expect(() => parseCapabilityString('Post|read|*|~WzEyM10')).toThrow(
        /Invalid encoded fields in capability string/,
      );
      // base64url of "123" is "MTIz", which is not an array
      expect(() => parseCapabilityString('Post|read|*|~MTIz')).toThrow(
        /Invalid encoded fields in capability string/,
      );
      // invalid base64 / json
      expect(() =>
        parseCapabilityString('Post|read|*|~invalid-base64!'),
      ).toThrow(/Invalid encoded fields in capability string/);
    });

    it('throws on non-data / non-enumerable condition array items', () => {
      const arr = [1];
      Object.defineProperty(arr, '0', { get: () => 1, enumerable: true });
      expect(() =>
        serializeCapability({
          subject: 'Post',
          action: 'read',
          conditions: { list: arr },
        }),
      ).toThrow('Capability conditions must be a JSON object.');
    });
  });

  describe('normalizeCapability', () => {
    it('parses capability strings', () => {
      expect(normalizeCapability('Post|read|*')).toEqual({
        subject: 'Post',
        action: 'read',
      });
    });

    it('passes through valid capability objects', () => {
      const cap: Capability = {
        subject: 'Post',
        action: 'read',
        conditions: { authorId: '123' },
        fields: ['title', 'body'],
        inverted: true,
        reason: 'hidden',
      };
      expect(normalizeCapability(cap)).toEqual(cap);
    });

    it('rejects non-plain objects or non-strings', () => {
      expect(() => normalizeCapability(null as never)).toThrow(
        'Capability must be an object or compact string.',
      );
      expect(() => normalizeCapability(123 as never)).toThrow(
        'Capability must be an object or compact string.',
      );
      expect(() => normalizeCapability([] as never)).toThrow(
        'Capability must be an object or compact string.',
      );
    });

    it('rejects invalid or empty subject', () => {
      expect(() =>
        normalizeCapability({ subject: '', action: 'read' }),
      ).toThrow('Capability subject must be a non-empty string.');
      expect(() =>
        normalizeCapability({ subject: 123 as never, action: 'read' }),
      ).toThrow('Capability subject must be a non-empty string.');
    });

    it('rejects invalid or empty action', () => {
      expect(() =>
        normalizeCapability({ subject: 'Post', action: '' }),
      ).toThrow('Capability action must be a non-empty string.');
      expect(() =>
        normalizeCapability({ subject: 'Post', action: 123 as never }),
      ).toThrow('Capability action must be a non-empty string.');
    });

    it('rejects invalid conditions', () => {
      expect(() =>
        normalizeCapability({
          subject: 'Post',
          action: 'read',
          conditions: 'invalid' as never,
        }),
      ).toThrow('Capability conditions must be a JSON object.');
      expect(() =>
        normalizeCapability({
          subject: 'Post',
          action: 'read',
          conditions: [] as never,
        }),
      ).toThrow('Capability conditions must be a JSON object.');
    });

    it('rejects invalid fields', () => {
      expect(() =>
        normalizeCapability({
          subject: 'Post',
          action: 'read',
          fields: 'title' as never,
        }),
      ).toThrow('Capability fields must be an array of strings.');
      expect(() =>
        normalizeCapability({
          subject: 'Post',
          action: 'read',
          fields: [123 as never],
        }),
      ).toThrow('Capability fields must be an array of strings.');
    });

    it('rejects invalid inverted', () => {
      expect(() =>
        normalizeCapability({
          subject: 'Post',
          action: 'read',
          inverted: 'true' as never,
        }),
      ).toThrow('Capability inverted must be a boolean.');
    });

    it('rejects invalid reason', () => {
      expect(() =>
        normalizeCapability({
          subject: 'Post',
          action: 'read',
          reason: 123 as never,
        }),
      ).toThrow('Capability reason must be a string.');
    });
  });
});
