/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Every query handler registered on the bus is reachable by anything that can
 * dispatch a query, so each one needs an authorization decision — even a
 * pass-through that only forwards to a repository.
 *
 * `GetUserContextHandler` had none. Its return type, `CaslUserContext`, is the
 * shape that carries roles and capabilities, so an unauthorized reader could ask
 * for any principal's authorization context by ID. The repository behind it is
 * narrow today, which limited the exposure but did not bound it.
 */

import { CaslBehavior } from '@nestjs-pipeline/casl';
import {
  getBehaviorId,
  PIPELINE_BEHAVIORS_METADATA,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
} from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { GetUserCapabilitiesHandler } from '../src/auths/cqrs/queries/get-user-capabilities.handler';
import { GetRoleHandler } from '../src/roles/cqrs/queries/get-role.handler';
import { GetRolesHandler } from '../src/roles/cqrs/queries/get-roles.handler';
import { GetUserHandler } from '../src/users/cqrs/queries/get-user.handler';
import { GetUserContextHandler } from '../src/users/cqrs/queries/get-user-context.handler';
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
    ['GetUserContextHandler', GetUserContextHandler],
    ['GetUserOverviewHandler', GetUserOverviewHandler],
  ])('%s is gated by CaslBehavior with at least one rule', (_name, handler) => {
    expect(declaresCasl(handler)).toBe(true);
    expect(caslRules(handler).length).toBeGreaterThan(0);
  });

  it('GetUserContextHandler requires read on User', () => {
    // Reading another principal's authorization context is a read on that user.
    expect(caslRules(GetUserContextHandler)).toEqual([
      { action: 'read', subject: 'User' },
    ]);
  });

  it('documents the one query that is deliberately ungated', () => {
    // GetUserCapabilitiesHandler serves the login flow itself, before a
    // principal exists to authorize against. Pinning it here makes the exception
    // explicit rather than an omission nobody notices.
    expect(declaresCasl(GetUserCapabilitiesHandler)).toBe(false);
  });
});
