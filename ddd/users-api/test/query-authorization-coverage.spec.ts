/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Every query handler registered on the bus is reachable by anything that can
 * dispatch a query, so each one needs an authorization decision — even a
 * pass-through that only forwards to a repository.
 */

import { CaslBehavior } from '@nestjs-pipeline/casl';
import {
  getBehaviorId,
  PIPELINE_BEHAVIORS_METADATA,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
} from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { GetRoleHandler } from '../src/roles/cqrs/queries/get-role.handler';
import { GetRolesHandler } from '../src/roles/cqrs/queries/get-roles.handler';
import { GetUserHandler } from '../src/users/cqrs/queries/get-user.handler';
import { GetUserOverviewHandler } from '../src/users/cqrs/queries/get-user-overview.handler';
import { GetUsersHandler } from '../src/users/cqrs/queries/get-users.handler';

function caslRules(
  handler: object,
): Array<{ action: string; subject: string }> {
  const options: Map<
    unknown,
    { rules?: Array<{ action: string; subject: string }> }
  > =
    Reflect.getMetadata(PIPELINE_BEHAVIORS_OPTIONS_METADATA, handler) ??
    new Map();
  return options.get(getBehaviorId(CaslBehavior as never))?.rules ?? [];
}

function declaresCasl(handler: object): boolean {
  const behaviors: Array<{ name: string }> =
    Reflect.getMetadata(PIPELINE_BEHAVIORS_METADATA, handler) ?? [];
  return behaviors.some((behavior) => behavior.name === CaslBehavior.name);
}

describe('query handlers declare an authorization rule', () => {
  it.each([
    ['GetUserHandler', GetUserHandler],
    ['GetUsersHandler', GetUsersHandler],
    ['GetRoleHandler', GetRoleHandler],
    ['GetRolesHandler', GetRolesHandler],
    ['GetUserOverviewHandler', GetUserOverviewHandler],
  ])('%s is gated by CaslBehavior with at least one rule', (_name, handler) => {
    expect(declaresCasl(handler)).toBe(true);
    expect(caslRules(handler).length).toBeGreaterThan(0);
  });
});
