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

/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: false positive */
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertEntityPermission } from './helpers/entity-authorization.helper';
import { buildAbility } from './services/ability.factory';
import type { CaslUserContext, RoleDefinition } from './types/casl.types';

// A supervisor of the "engineering" department who may update users in their
// own department (any field), and may always update their own username.
const supervisorRole: RoleDefinition = {
  name: 'supervisor',
  capabilities: [
    'User|update|{"department":"${department}"}',
    'User|update|{"id":"${id}"}|username',
    // Nobody may change a user's department or supervisor via this role.
    '!User|update|*|department',
    '!User|update|*|supervisorId',
  ],
};

const supervisor: CaslUserContext = { id: 1, department: 'engineering' };

describe('assertEntityPermission', () => {
  it('allows updating a user in the supervisor own department', () => {
    const ability = buildAbility([supervisorRole], supervisor);

    expect(() =>
      assertEntityPermission(ability, {
        action: 'update',
        subject: 'User',
        entity: { id: 2, department: 'engineering', username: 'bob' },
        fields: ['username'],
      }),
    ).not.toThrow();
  });

  it('denies updating a user in another department', () => {
    const ability = buildAbility([supervisorRole], supervisor);

    expect(() =>
      assertEntityPermission(ability, {
        action: 'update',
        subject: 'User',
        entity: { id: 3, department: 'marketing', username: 'carol' },
        fields: ['username'],
      }),
    ).toThrow(ForbiddenException);
  });

  it('denies changing a protected field even within the department', () => {
    const ability = buildAbility([supervisorRole], supervisor);

    expect(() =>
      assertEntityPermission(ability, {
        action: 'update',
        subject: 'User',
        entity: { id: 2, department: 'engineering' },
        fields: ['department'],
      }),
    ).toThrow(ForbiddenException);
  });

  it('lets a user update their own username regardless of department', () => {
    const ability = buildAbility([supervisorRole], supervisor);

    expect(() =>
      assertEntityPermission(ability, {
        action: 'update',
        subject: 'User',
        entity: { id: 1, department: 'engineering', username: 'me' },
        fields: ['username'],
      }),
    ).not.toThrow();
  });
});
