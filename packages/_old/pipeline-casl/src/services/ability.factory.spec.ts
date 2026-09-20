/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import type { RoleDefinition } from '../types/casl.types';
import { buildAbility, buildAbilityFromRules } from './ability.factory';

describe('buildAbility & buildAbilityFromRules', () => {
  it('correctly builds ability ensuring denials override broad grants', () => {
    const roles: RoleDefinition[] = [
      {
        name: 'manager',
        capabilities: ['User|manage|*'],
      },
    ];

    const denied = ['!User|delete|*'];

    const ability = buildAbility(roles, { id: 'u-1' }, undefined, denied);

    expect(ability.can('read', 'User')).toBe(true);
    expect(ability.can('update', 'User')).toBe(true);
    expect(ability.can('delete', 'User')).toBe(false);
  });

  it('forces capabilities from the denied collection to be inverted', () => {
    const ability = buildAbility(
      [{ name: 'manager', capabilities: ['Post|manage|*'] }],
      { id: 'u-1' },
      undefined,
      ['Post|delete|*'],
    );

    expect(ability.can('read', 'Post')).toBe(true);
    expect(ability.can('delete', 'Post')).toBe(false);
  });

  it('interpolates user context variables in conditions', () => {
    const roles: RoleDefinition[] = [
      {
        name: 'member',
        capabilities: ['Doc|update|{"ownerId":"${id}"}'],
      },
    ];

    const ability = buildAbility(roles, { id: 'usr-99' });

    expect(
      ability.can('update', {
        __caslSubjectType__: 'Doc',
        ownerId: 'usr-99',
      } as any),
    ).toBe(true);
    expect(
      ability.can('update', {
        __caslSubjectType__: 'Doc',
        ownerId: 'usr-100',
      } as any),
    ).toBe(false);
  });

  it('builds ability directly from raw rules using buildAbilityFromRules', () => {
    const rawRules = [
      { action: 'read', subject: 'Article' },
      { action: 'write', subject: 'Article', inverted: true },
    ];

    const ability = buildAbilityFromRules(rawRules);
    expect(ability.can('read', 'Article')).toBe(true);
    expect(ability.can('write', 'Article')).toBe(false);
  });
});
