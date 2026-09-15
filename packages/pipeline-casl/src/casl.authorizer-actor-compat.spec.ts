/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { CaslAuthorizer } from './helpers/entity-authorization.helper';
import { buildAbilityFromRules } from './services/ability.factory';
import type { CaslUserContext } from './types/casl.types';

class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
  ) {}
}

describe('CaslAuthorizer actor-first compatibility overload', () => {
  it('continues using an explicitly injected ability instead of rebuilding from the actor', () => {
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'User' },
    ]);
    const authorizer = new CaslAuthorizer(ability);
    const actor: CaslUserContext = { id: 'actor-1' };

    expect(
      authorizer.authorize<User>(
        actor,
        'read',
        new User('user-1', 'user@example.com'),
      ),
    ).toMatchObject({ id: 'user-1', email: 'user@example.com' });
  });

  it('does not treat an actor object as an authorization bypass', () => {
    const ability = buildAbilityFromRules([]);
    const authorizer = new CaslAuthorizer(ability);
    const actor: CaslUserContext = { id: 'actor-1' };

    expect(() =>
      authorizer.authorize(
        actor,
        'delete',
        new User('user-1', 'x@example.com'),
      ),
    ).toThrow(/insufficient permissions/);
  });
});
