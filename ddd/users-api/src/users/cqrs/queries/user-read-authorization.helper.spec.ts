import { ForbiddenException } from '@nestjs/common';
import {
  buildAbility,
  CASL_ABILITY_KEY,
  type RoleDefinition,
} from '@nestjs-pipeline/casl';
import { pipelineStore, uuidv7 } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { User } from '../../domain/models/user.entity';
import { authorizeUserRead } from './user-read-authorization.helper';

const ACTOR_ID = uuidv7();
const TARGET_ID = uuidv7();

function user(id: string, department: string) {
  return User.fromJSON({
    id,
    username: 'Alice',
    email: 'alice@example.test',
    department,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

function snapshot(id: string, department: string) {
  return user(id, department).toJSON();
}

function withAbility<T>(role: RoleDefinition, run: () => T): T {
  const ability = buildAbility([role], {
    id: ACTOR_ID,
    department: 'engineering',
  });
  return pipelineStore.run(
    { items: new Map([[CASL_ABILITY_KEY, ability]]) } as never,
    run,
  );
}

describe('authorizeUserRead', () => {
  it('checks ownership conditions against the persisted target id', () => {
    const role: RoleDefinition = {
      name: 'self',
      capabilities: ['User|read|{"id":"${id}"}'],
    };
    const target = user(TARGET_ID, 'engineering');

    expect(() => withAbility(role, () => authorizeUserRead(target))).toThrow(
      ForbiddenException,
    );
  });

  it('projects field-restricted reads without returning department', () => {
    const role: RoleDefinition = {
      name: 'viewer',
      capabilities: ['User|read|*|id,username,email'],
    };
    const target = user(TARGET_ID, 'engineering');

    const result = withAbility(role, () => authorizeUserRead(target));

    expect(result).toEqual({
      id: TARGET_ID,
      username: 'Alice',
      email: 'alice@example.test',
    });
  });

  it('authorizes a plain cached snapshot', () => {
    const role: RoleDefinition = {
      name: 'viewer',
      capabilities: ['User|read|*|id,username,email'],
    };

    expect(
      withAbility(role, () =>
        authorizeUserRead(snapshot(TARGET_ID, 'engineering')),
      ),
    ).toEqual({
      id: TARGET_ID,
      username: 'Alice',
      email: 'alice@example.test',
    });
  });

  it('rejects field permissions that omit a mandatory response field', () => {
    const role: RoleDefinition = {
      name: 'limited-viewer',
      capabilities: ['User|read|*|id,username'],
    };
    const target = user(TARGET_ID, 'engineering');

    expect(() => withAbility(role, () => authorizeUserRead(target))).toThrow(
      ForbiddenException,
    );
  });

  it('can omit unauthorized rows from collection reads', () => {
    const role: RoleDefinition = {
      name: 'department-reader',
      capabilities: ['User|read|{"department":"${department}"}'],
    };
    const target = user(TARGET_ID, 'sales');

    expect(
      withAbility(role, () =>
        authorizeUserRead(target, { omitUnauthorized: true }),
      ),
    ).toBeNull();
  });
});
