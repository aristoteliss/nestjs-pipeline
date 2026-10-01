/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AUDIT_ACTIONS } from '@common/constants/index.js';
import { AuditBehavior } from '@nestjs-pipeline/audit';
import {
  getBehaviorId,
  PIPELINE_BEHAVIORS_METADATA,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
} from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { CreateAuthHandler } from '../src/auths/application/cqrs/commands/create-auth.handler.js';
import { RevokeAuthHandler } from '../src/auths/application/cqrs/commands/revoke-auth.handler.js';
import { CreateRoleHandler } from '../src/roles/application/cqrs/commands/create-role.handler.js';
import { DeleteRoleHandler } from '../src/roles/application/cqrs/commands/delete-role.handler.js';
import { UpdateRoleHandler } from '../src/roles/application/cqrs/commands/update-role.handler.js';
import { CreateUserHandler } from '../src/users/application/cqrs/commands/create-user.handler.js';
import { DeleteUserHandler } from '../src/users/application/cqrs/commands/delete-user.handler.js';
import { UpdateUserHandler } from '../src/users/application/cqrs/commands/update-user.handler.js';

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
    ['RevokeAuthHandler', RevokeAuthHandler, AUDIT_ACTIONS.AUTH_LOGOUT],
  ])('%s declares an audit action', (_name, handler, action) => {
    expect(auditAction(handler)).toBe(action);
  });
});
