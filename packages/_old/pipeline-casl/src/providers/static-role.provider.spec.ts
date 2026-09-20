/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import type { RoleDefinition } from '../types/casl.types';
import { StaticRoleProvider } from './static-role.provider';

describe('StaticRoleProvider', () => {
  const roles: RoleDefinition[] = [
    {
      name: 'admin',
      capabilities: ['all|manage|*'],
    },
    {
      name: 'author',
      capabilities: ['Post|read|*', 'Post|create|*'],
    },
    {
      name: 'viewer',
      capabilities: ['Post|read|*'],
    },
  ];

  const provider = new StaticRoleProvider(roles);

  it('returns all roles when no filter names are provided', () => {
    const result = provider.getRoles();
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.name)).toEqual(['admin', 'author', 'viewer']);
  });

  it('returns only matched roles when names array is provided', () => {
    const result = provider.getRoles(['admin', 'viewer', 'non-existent']);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name)).toEqual(['admin', 'viewer']);
  });

  it('rejects duplicate role names', () => {
    expect(() => new StaticRoleProvider([roles[0], { ...roles[0] }])).toThrow(
      'Duplicate static role name',
    );
  });
});
