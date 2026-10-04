/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Every query handler registered on the bus is reachable by anything that can
 * dispatch a query, so each one needs an authorization decision — even a
 * pass-through that only forwards to a repository.
 */

import { getBehaviorId, pipelineOf } from '@cqrs-ddd/pipeline';
import { CaslBehavior } from '@cqrs-ddd/pipeline-casl';
import { describe, expect, it } from 'vitest';
import { GetUserPermissionRulesHandler } from '../src/auths/application/cqrs/queries/get-user-permission-rules.handler.js';
import { GetRoleHandler } from '../src/roles/application/cqrs/queries/get-role.handler.js';
import { GetRolesHandler } from '../src/roles/application/cqrs/queries/get-roles.handler.js';
import { GetUserHandler } from '../src/users/application/cqrs/queries/get-user.handler.js';
import { GetUserOverviewHandler } from '../src/users/application/cqrs/queries/get-user-overview.handler.js';
import { GetUsersHandler } from '../src/users/application/cqrs/queries/get-users.handler.js';

function caslRules(
  handler: object,
): Array<{ action: string; subject: string }> {
  const options: Map<
    unknown,
    { rules?: Array<{ action: string; subject: string }> }
  > = pipelineOf(handler as never).options;
  return options.get(getBehaviorId(CaslBehavior as never))?.rules ?? [];
}

function declaresCasl(handler: object): boolean {
  const behaviors: Array<{ name: string }> = pipelineOf(handler as never).types;
  return behaviors.some((behavior) => behavior.name === CaslBehavior.name);
}

describe('query handlers declare an authorization rule', () => {
  it.each([
    ['GetUserHandler', GetUserHandler],
    ['GetUsersHandler', GetUsersHandler],
    ['GetRoleHandler', GetRoleHandler],
    ['GetRolesHandler', GetRolesHandler],
    ['GetUserOverviewHandler', GetUserOverviewHandler],
    ['GetUserPermissionRulesHandler', GetUserPermissionRulesHandler],
  ])('%s is gated by CaslBehavior with at least one rule', (_name, handler) => {
    expect(declaresCasl(handler)).toBe(true);
    expect(caslRules(handler).length).toBeGreaterThan(0);
  });
});
