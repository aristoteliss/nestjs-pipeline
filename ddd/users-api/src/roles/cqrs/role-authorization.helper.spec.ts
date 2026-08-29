import { ForbiddenException } from '@nestjs/common';
import {
  buildAbility,
  CASL_ABILITY_KEY,
  type RoleDefinition,
} from '@nestjs-pipeline/casl';
import { pipelineStore } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { Role } from '../domain/models/role.entity';
import {
  assertRolePermission,
  authorizeRoleRead,
} from './role-authorization.helper';

function withAbility<T>(role: RoleDefinition, run: () => T): T {
  const ability = buildAbility([role], { id: 'actor-1' });
  return pipelineStore.run(
    { items: new Map([[CASL_ABILITY_KEY, ability]]) } as never,
    run,
  );
}

describe('role entity authorization', () => {
  it('checks mutations against the loaded role', () => {
    const policy: RoleDefinition = {
      name: 'admin-editor',
      capabilities: ['Role|update|{"name":"admin"}'],
    };
    const viewer = Role.create('viewer').entity;

    expect(() =>
      withAbility(policy, () =>
        assertRolePermission(viewer, 'update', ['name']),
      ),
    ).toThrow(ForbiddenException);
  });

  it('filters unauthorized role rows and projects readable rows', () => {
    const policy: RoleDefinition = {
      name: 'admin-reader',
      capabilities: ['Role|read|{"name":"admin"}'],
    };
    const admin = Role.create('admin').entity;
    const viewer = Role.create('viewer').entity;

    expect(withAbility(policy, () => authorizeRoleRead(admin))).toEqual({
      id: admin.id,
      name: 'admin',
    });
    expect(
      withAbility(policy, () =>
        authorizeRoleRead(viewer, { omitUnauthorized: true }),
      ),
    ).toBeNull();
  });
});
