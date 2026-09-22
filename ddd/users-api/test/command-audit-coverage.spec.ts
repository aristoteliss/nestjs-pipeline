/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AUDIT_ACTIONS } from '@common/constants';
import { AuditBehavior } from '@nestjs-pipeline/audit';
import {
  getBehaviorId,
  PIPELINE_BEHAVIORS_METADATA,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
} from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { CreateAuthHandler } from '../src/auths/cqrs/commands/create-auth.handler';
import { DeleteAuthHandler } from '../src/auths/cqrs/commands/delete-auth.handler';
import { RefreshAuthHandler } from '../src/auths/cqrs/commands/refresh-auth.handler';
import { CreateRoleHandler } from '../src/roles/cqrs/commands/create-role.handler';
import { DeleteRoleHandler } from '../src/roles/cqrs/commands/delete-role.handler';
import { UpdateRoleHandler } from '../src/roles/cqrs/commands/update-role.handler';
import { CreateUserHandler } from '../src/users/cqrs/commands/create-user.handler';
import { DeleteUserHandler } from '../src/users/cqrs/commands/delete-user.handler';
import { UpdateUserHandler } from '../src/users/cqrs/commands/update-user.handler';

function auditAction(handler: object): string | undefined {
  const behaviors: Array<{ name: string }> =
    Reflect.getMetadata(PIPELINE_BEHAVIORS_METADATA, handler) ?? [];
  if (!behaviors.some((behavior) => behavior.name === AuditBehavior.name)) {
    return undefined;
  }
  const options: Map<unknown, { action?: string }> =
    Reflect.getMetadata(PIPELINE_BEHAVIORS_OPTIONS_METADATA, handler) ??
    new Map();
  return options.get(getBehaviorId(AuditBehavior as never))?.action;
}

describe('command handlers declare an audit action', () => {
  it.each([
    ['CreateUserHandler', CreateUserHandler, AUDIT_ACTIONS.USER_CREATE],
    ['UpdateUserHandler', UpdateUserHandler, AUDIT_ACTIONS.USER_UPDATE],
    ['DeleteUserHandler', DeleteUserHandler, AUDIT_ACTIONS.USER_DELETE],
    ['CreateRoleHandler', CreateRoleHandler, AUDIT_ACTIONS.ROLE_CREATE],
    ['UpdateRoleHandler', UpdateRoleHandler, AUDIT_ACTIONS.ROLE_UPDATE],
    ['DeleteRoleHandler', DeleteRoleHandler, AUDIT_ACTIONS.ROLE_DELETE],
    ['CreateAuthHandler', CreateAuthHandler, AUDIT_ACTIONS.AUTH_LOGIN],
    ['RefreshAuthHandler', RefreshAuthHandler, AUDIT_ACTIONS.AUTH_REFRESH],
    ['DeleteAuthHandler', DeleteAuthHandler, AUDIT_ACTIONS.AUTH_LOGOUT],
  ])('%s declares an audit action', (_name, handler, action) => {
    expect(auditAction(handler)).toBe(action);
  });
});
