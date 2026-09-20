/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: placeholders are data */
import { subject } from '@casl/ability';
import { describe, expect, it } from 'vitest';
import type { CaslPrincipal } from '../interfaces/permission-source.interface';
import type { Capability } from '../types/casl.types';
import { buildAbility, interpolateConditions } from './ability';

const entity = (type: string, attributes: Record<string, unknown>) =>
  subject(type, attributes) as unknown as string;

describe('interpolateConditions', () => {
  const principal: CaslPrincipal = {
    id: 'u-42',
    tenantId: 'abc',
    name: 'Alice',
    level: 42,
  };

  it('interpolates ${property} placeholders', () => {
    expect(interpolateConditions({ authorId: '${id}' }, principal)).toEqual({
      authorId: 'u-42',
    });
  });

  it('interpolates {{ property }} placeholders', () => {
    expect(interpolateConditions({ authorId: '{{ id }}' }, principal)).toEqual({
      authorId: 'u-42',
    });
  });

  it('preserves the type of a whole-string placeholder', () => {
    expect(interpolateConditions({ level: '${level}' }, principal)).toEqual({
      level: 42,
    });
  });

  it('interpolates placeholders inside mixed strings', () => {
    expect(
      interpolateConditions({ prefix: 'user-${id}-posts' }, principal),
    ).toEqual({ prefix: 'user-u-42-posts' });
  });

  it('interpolates nested conditions', () => {
    expect(
      interpolateConditions({ owner: { id: '${id}' } }, principal),
    ).toEqual({ owner: { id: 'u-42' } });
  });

  it('strips an optional user. prefix', () => {
    expect(
      interpolateConditions({ tenantId: '${user.tenantId}' }, principal),
    ).toEqual({ tenantId: 'abc' });
    expect(
      interpolateConditions(
        { owner: { tenantId: '${user.tenantId}' } },
        principal,
      ),
    ).toEqual({ owner: { tenantId: 'abc' } });
  });

  it('rejects unknown leading root segments', () => {
    expect(() =>
      interpolateConditions({ tenantId: '${principal.tenantId}' }, principal),
    ).toThrow('principal.tenantId');
    expect(() =>
      interpolateConditions({ authorId: '${typo.foo.id}' }, principal),
    ).toThrow('typo.foo.id');
  });

  it('passes through non-string values', () => {
    expect(
      interpolateConditions(
        { status: true, count: 5, tags: ['a', 'b'] },
        principal,
      ),
    ).toEqual({ status: true, count: 5, tags: ['a', 'b'] });
  });

  it('interpolates placeholders recursively inside arrays', () => {
    expect(
      interpolateConditions(
        {
          tenantId: {
            $in: ['${user.tenantId}', 'public'],
            $nin: ['blocked-${id}'],
          },
        },
        principal,
      ),
    ).toEqual({
      tenantId: { $in: ['abc', 'public'], $nin: ['blocked-u-42'] },
    });
  });

  it('throws when a placeholder cannot be resolved', () => {
    expect(() =>
      interpolateConditions({ department: '${department}' }, principal),
    ).toThrow('department');
    expect(() =>
      interpolateConditions({ prefix: 'team-${department}' }, principal),
    ).toThrow('department');
  });

  it('preserves an own __proto__ condition as ordinary data', () => {
    const conditions = JSON.parse(
      '{"__proto__":{"tenantId":"${user.tenantId}"}}',
    ) as Record<string, unknown>;
    const result = interpolateConditions(conditions, principal);

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(Reflect.get(result, '__proto__')).toEqual({ tenantId: 'abc' });
  });

  it('does not resolve inherited placeholder properties', () => {
    expect(() =>
      interpolateConditions({ value: '${constructor}' }, principal),
    ).toThrow('constructor');
    expect(() =>
      interpolateConditions({ value: '${toString}' }, principal),
    ).toThrow('toString');
  });
});

describe('buildAbility', () => {
  it('places every direct rule before every inverted rule, stable within each group', () => {
    const ability = buildAbility([
      '!Post|delete|*',
      'Post|read|*',
      '!Post|update|*',
      'Post|create|*',
    ]);

    expect(
      ability.rules.map((rule) => [rule.action, rule.inverted ?? false]),
    ).toEqual([
      ['read', false],
      ['create', false],
      ['delete', true],
      ['update', true],
    ]);
  });

  it('converts a capability into a raw rule with its reason and fields', () => {
    const ability = buildAbility([
      { subject: 'Post', action: 'update', fields: ['title', 'content'] },
      {
        subject: 'Post',
        action: 'delete',
        inverted: true,
        reason: 'Posts cannot be deleted',
      },
    ]);

    expect(ability.rules).toEqual([
      { action: 'update', subject: 'Post', fields: ['title', 'content'] },
      {
        action: 'delete',
        subject: 'Post',
        inverted: true,
        reason: 'Posts cannot be deleted',
      },
    ]);
  });

  describe('deny precedence across sources', () => {
    const manageAll: Capability = { subject: 'all', action: 'manage' };
    const denyDelete: Capability = {
      subject: 'User',
      action: 'delete',
      inverted: true,
    };

    it.each([
      ['grant first', [manageAll, denyDelete]],
      ['deny first', [denyDelete, manageAll]],
    ])(
      'denies delete User when a broad grant meets a deny (%s)',
      (_, rules) => {
        const ability = buildAbility(rules);

        expect(ability.can('delete', 'User')).toBe(false);
        expect(ability.can('read', 'User')).toBe(true);
      },
    );

    it('denies when a role-style allow and a user-style deny name the same rule', () => {
      const ability = buildAbility([
        'User|update|*|username',
        {
          subject: 'User',
          action: 'update',
          fields: ['username'],
          inverted: true,
        },
      ]);

      expect(ability.can('update', 'User', 'username')).toBe(false);
    });

    it('denies when one source grants and denies the same rule', () => {
      const ability = buildAbility(['!User|read|*', 'User|read|*']);

      expect(ability.can('read', 'User')).toBe(false);
    });
  });

  it('interpolates placeholders against the principal', () => {
    const ability = buildAbility(
      [
        'User|read|{"department":"${user.department}"}',
        'Post|read|{"level":"${level}"}',
      ],
      { id: 'u-1', department: 'engineering', level: 3 },
    );

    expect(ability.rules[1].conditions).toEqual({ level: 3 });
    expect(
      ability.can('read', entity('User', { department: 'engineering' })),
    ).toBe(true);
    expect(ability.can('read', entity('User', { department: 'sales' }))).toBe(
      false,
    );
    expect(ability.can('read', entity('Post', { level: 3 }))).toBe(true);
    expect(ability.can('read', entity('Post', { level: '3' }))).toBe(false);
  });

  it('keeps raw conditions when no principal is given', () => {
    const ability = buildAbility(['Post|update|{"authorId":"${id}"}']);

    expect(ability.rules[0].conditions).toEqual({ authorId: '${id}' });
  });

  it('throws for a placeholder the principal cannot resolve', () => {
    expect(() =>
      buildAbility(['User|read|{"department":"${department}"}'], { id: 'u-1' }),
    ).toThrow('department');
  });

  it('rejects an allow rule with an empty fields list', () => {
    expect(() =>
      buildAbility([{ subject: 'Doc', action: 'read', fields: [] }]),
    ).toThrow(/empty fields list/);
  });

  it('treats an inverted rule with an empty fields list as a denial of all fields', () => {
    const ability = buildAbility([
      'Doc|read|*',
      { subject: 'Doc', action: 'read', inverted: true, fields: [] },
    ]);

    expect(ability.can('read', 'Doc', 'title')).toBe(false);
  });

  it('treats string and object inputs identically', () => {
    const principal = { id: 'u-1', department: 'engineering' };
    const fromStrings = buildAbility(
      ['User|update|{"department":"${department}"}|username', '!User|delete|*'],
      principal,
    );
    const fromObjects = buildAbility(
      [
        {
          subject: 'User',
          action: 'update',
          conditions: { department: '${department}' },
          fields: ['username'],
        },
        { subject: 'User', action: 'delete', inverted: true },
      ],
      principal,
    );

    expect(fromStrings.rules).toEqual(fromObjects.rules);
  });

  it('rejects malformed rules', () => {
    expect(() =>
      buildAbility([{ subject: '', action: 'read' } as Capability]),
    ).toThrow(TypeError);
  });
});
