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
});
