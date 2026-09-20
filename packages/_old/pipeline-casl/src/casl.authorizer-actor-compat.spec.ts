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

/**
 * The actor-first overload was removed. It promised something it could not do —
 * an actor value cannot be turned into an ability without application role data,
 * so it silently used the ambient one — and its three-argument shape was
 * indistinguishable from `(action, subject, fields)`, so a string actor was read
 * as the action. Both failure modes were invisible at the call site.
 */
describe('CaslAuthorizer argument dispatch', () => {
  const ability = buildAbilityFromRules([{ action: 'read', subject: 'User' }]);
  const subject = new User('user-1', 'user@example.com');

  it('rejects an actor object rather than silently substituting the ambient ability', () => {
    const authorizer = new CaslAuthorizer(ability);
    const actor: CaslUserContext = { id: 'actor-1' };

    expect(() =>
      (authorizer.authorize as unknown as (...a: unknown[]) => unknown)(
        actor,
        'read',
        subject,
      ),
    ).toThrow(TypeError);
  });

  it('names the supported shapes in the rejection', () => {
    const authorizer = new CaslAuthorizer(ability);

    expect(() =>
      (authorizer.authorize as unknown as (...a: unknown[]) => unknown)(
        { id: 'actor-1' },
        'read',
        subject,
      ),
    ).toThrow(/\(action, subject, fields\?\)/);
  });

  it('accepts the short form against the injected ability', () => {
    const authorizer = new CaslAuthorizer(ability);

    expect(authorizer.authorize<User>('read', subject)).toMatchObject({
      id: 'user-1',
      email: 'user@example.com',
    });
  });

  it('accepts an explicit ability as the first argument', () => {
    const authorizer = new CaslAuthorizer();

    expect(authorizer.authorize<User>(ability, 'read', subject)).toMatchObject({
      id: 'user-1',
    });
  });

  it('rejects an actor object passed to filter() as well', () => {
    const authorizer = new CaslAuthorizer(ability);

    expect(() =>
      (authorizer.filter as unknown as (...a: unknown[]) => unknown)(
        { id: 'actor-1' },
        'read',
        [subject],
      ),
    ).toThrow(TypeError);
  });

  it('still filters with an explicit ability', () => {
    const authorizer = new CaslAuthorizer();

    expect(authorizer.filter<User>(ability, 'read', [subject])).toHaveLength(1);
  });
});
