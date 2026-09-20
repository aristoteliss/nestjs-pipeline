/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: false positive */
import { pipelineStore } from '@nestjs-pipeline/core';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { CASL_ABILITY_KEY } from './constants/tokens';
import { UnauthorizedActionException } from './exceptions/unauthorized-action.exception';
import {
  CaslAuthorizer,
  type CaslAuthorizerOptions,
  getCaslAbility,
  hasEntityConditions,
} from './helpers/entity-authorization.helper';
import type { IEntityAuthorizer } from './interfaces/entity-authorizer.interface';
import {
  buildAbility,
  buildAbilityFromRules,
  buildBypassAbility,
} from './services/ability.factory';
import type {
  CaslUserContext,
  Projected,
  RoleDefinition,
} from './types/casl.types';

// Roles for testing
const supervisorRole: RoleDefinition = {
  name: 'supervisor',
  capabilities: [
    'User|read|{"department":"${department}"}',
    'User|update|{"department":"${department}"}',
    'User|delete|{"department":"${department}"}',
    'User|create|*',
    'User|update|{"id":"${id}"}|username',
    // Protected fields
    '!User|update|*|department',
    '!User|update|*|supervisorId',
  ],
};

const supervisor: CaslUserContext = { id: 1, department: 'engineering' };

class User {
  constructor(
    public readonly id: number,
    public readonly department: string,
    public readonly username: string,
  ) {}

  toJSON() {
    return {
      id: this.id,
      department: this.department,
      username: this.username,
    };
  }
}

class EntityWithoutToJSON {
  constructor(
    public readonly id: number,
    public readonly title: string,
  ) {}
}

describe('getCaslAbility', () => {
  it('returns undefined when neither context nor ambient store is present', () => {
    expect(getCaslAbility()).toBeUndefined();
  });

  it('returns ability from explicit IPipelineContext', () => {
    const ability = buildAbility([supervisorRole], supervisor);
    const items = new Map<unknown, unknown>();
    items.set(CASL_ABILITY_KEY, ability);
    const context = { items } as any;

    expect(getCaslAbility(context)).toBe(ability);
  });

  it('returns ability from ambient pipelineStore', () => {
    const ability = buildAbility([supervisorRole], supervisor);
    const items = new Map<unknown, unknown>();
    items.set(CASL_ABILITY_KEY, ability);
    const fakeContext = { items } as any;

    pipelineStore.run(fakeContext, () => {
      expect(getCaslAbility()).toBe(ability);
    });
  });
});

describe('CaslAuthorizer', () => {
  describe('can()', () => {
    it('returns false when no ability is available (default deny)', () => {
      const authorizer = new CaslAuthorizer();
      expect(authorizer.can('update', 'User')).toBe(false);
      expect(
        authorizer.can('update', new User(1, 'engineering', 'alice')),
      ).toBe(false);
      expect(
        authorizer.can(
          'update',
          new User(1, 'engineering', 'alice'),
          'username',
        ),
      ).toBe(false);
    });

    it('returns true when explicit bypass is configured on authorizer', () => {
      const bypassAuthorizer = CaslAuthorizer.bypass();
      expect(bypassAuthorizer.can('update', 'User')).toBe(true);
      expect(
        bypassAuthorizer.can('update', new User(1, 'engineering', 'alice')),
      ).toBe(true);
      expect(
        bypassAuthorizer.can(
          'update',
          new User(1, 'engineering', 'alice'),
          'username',
        ),
      ).toBe(true);

      const bypassOptionsAuthorizer = new CaslAuthorizer({ bypass: true });
      expect(bypassOptionsAuthorizer.can('update', 'User')).toBe(true);
    });

    it('supports 3-arg signature: can(action, entity, field)', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer: IEntityAuthorizer = new CaslAuthorizer(ability);
      const user = new User(2, 'engineering', 'alice');

      expect(authorizer.can('update', user, 'username')).toBe(true);
      expect(authorizer.can('update', user, 'department')).toBe(false);
    });

    it('supports 2-arg signature with entity instance: can(action, entity)', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);
      const userEng = new User(2, 'engineering', 'alice');
      const userMkt = new User(3, 'marketing', 'carol');

      expect(authorizer.can('delete', userEng)).toBe(true);
      expect(authorizer.can('delete', userMkt)).toBe(false);
    });

    it('supports 2-arg signature with string subject: can(action, subjectStr)', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);

      expect(authorizer.can('create', 'User')).toBe(true);
      expect(authorizer.can('delete', 'Post')).toBe(false);
    });

    it('supports plain object without toJSON and resolves subject constructor name', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);

      const plainObj = { id: 2, department: 'engineering' };
      expect(authorizer.can('update', plainObj)).toBe(false);

      const customEntity = new EntityWithoutToJSON(10, 'Some Title');
      expect(authorizer.can('update', customEntity)).toBe(false);
    });

    it('resolves ability from ambient pipelineStore when constructor ability is omitted', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer();

      const items = new Map<unknown, unknown>();
      items.set(CASL_ABILITY_KEY, ability);
      const fakeContext = { items } as any;

      pipelineStore.run(fakeContext, () => {
        expect(
          authorizer.can(
            'update',
            new User(2, 'engineering', 'alice'),
            'username',
          ),
        ).toBe(true);

        expect(
          authorizer.can(
            'update',
            new User(3, 'marketing', 'carol'),
            'username',
          ),
        ).toBe(false);
      });
    });
  });

  describe('authorize()', () => {
    it('throws UnauthorizedActionException when no ability is available (default deny)', () => {
      const authorizer = new CaslAuthorizer();
      const entityWithToJSON = new User(5, 'engineering', 'eve');
      const plainObj = { id: 6, title: 'No toJSON' };
      const strSubject = 'User';

      expect(() => authorizer.authorize('update', entityWithToJSON)).toThrow(
        UnauthorizedActionException,
      );
      expect(() => authorizer.authorize('update', plainObj)).toThrow(
        UnauthorizedActionException,
      );
      expect(() => authorizer.authorize('create', strSubject)).toThrow(
        UnauthorizedActionException,
      );
    });

    it('returns subject or subject.toJSON() when explicit bypass is enabled', () => {
      const bypassAuthorizer = CaslAuthorizer.bypass();
      const entityWithToJSON = new User(5, 'engineering', 'eve');
      const plainObj = { id: 6, title: 'No toJSON' };
      const strSubject = 'User';

      expect(bypassAuthorizer.authorize('update', entityWithToJSON)).toEqual({
        id: 5,
        department: 'engineering',
        username: 'eve',
      });
      expect(bypassAuthorizer.authorize('update', plainObj)).toBe(plainObj);
      expect(bypassAuthorizer.authorize('create', strSubject)).toBe('User');

      const optionsBypass = new CaslAuthorizer({ bypass: true });
      expect(optionsBypass.authorize('update', entityWithToJSON)).toEqual({
        id: 5,
        department: 'engineering',
        username: 'eve',
      });
    });

    it('authorizes valid update on entity instance with field list', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);
      const user = new User(2, 'engineering', 'alice');

      const result = authorizer.authorize('update', user, ['username']);
      expect(result).toEqual({
        id: 2,
        department: 'engineering',
        username: 'alice',
      });
    });

    it('throws UnauthorizedActionException when a field update is denied', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);
      const user = new User(2, 'engineering', 'alice');

      try {
        authorizer.authorize('update', user, ['department']);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedActionException);
        const authErr = err as UnauthorizedActionException;
        expect(authErr.action).toBe('update');
        expect(authErr.subject).toBe('User');
        expect(authErr.entityId).toBe(2);
        expect(authErr.fields).toEqual(['department']);
        expect(authErr.message).toContain(
          'Access denied: insufficient permissions to update User field "department".',
        );
      }
    });

    it('throws UnauthorizedActionException when whole-entity condition fails with fields', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);
      const user = new User(3, 'sales', 'charlie');

      expect(() =>
        authorizer.authorize('update', user, ['username']),
      ).toThrowError(
        /Access denied: insufficient permissions to update User field "username"/,
      );
    });

    it('authorizes whole-entity action without fields (e.g. delete, update)', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);
      const userEng = new User(2, 'engineering', 'alice');

      const result = authorizer.authorize('delete', userEng);
      expect(result).toEqual({
        id: 2,
        department: 'engineering',
        username: 'alice',
      });
    });

    it('throws UnauthorizedActionException on whole-entity action when denied without fields', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);
      const userMkt = new User(3, 'marketing', 'carol');

      try {
        authorizer.authorize('delete', userMkt);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedActionException);
        const authErr = err as UnauthorizedActionException;
        expect(authErr.action).toBe('delete');
        expect(authErr.subject).toBe('User');
        expect(authErr.entityId).toBe(3);
        expect(authErr.message).toContain(
          'Access denied: insufficient permissions to delete User.',
        );
      }
    });

    it('authorizes read and masks unauthorized fields', () => {
      const readerRole: RoleDefinition = {
        name: 'reader',
        capabilities: [
          'User|read|*|id',
          'User|read|*|username',
          '!User|read|*|department',
        ],
      };
      const ability = buildAbility([readerRole], { id: 10 });
      const authorizer = new CaslAuthorizer(ability);
      const user = new User(2, 'engineering', 'alice');

      const masked = authorizer.authorize<Record<string, unknown>>(
        'read',
        user,
      );
      expect(masked).toEqual({
        id: 2,
        username: 'alice',
      });
      expect(masked.department).toBeUndefined();
    });

    it('throws UnauthorizedActionException when read is completely forbidden for entity', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);
      const userMkt = new User(3, 'marketing', 'carol');

      try {
        authorizer.authorize('read', userMkt);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedActionException);
        const authErr = err as UnauthorizedActionException;
        expect(authErr.action).toBe('read');
        expect(authErr.subject).toBe('User');
        expect(authErr.entityId).toBe(3);
        expect(authErr.message).toContain(
          'Access denied: insufficient permissions to read User.',
        );
      }
    });

    it('handles string subjects with read action', () => {
      const readerRole: RoleDefinition = {
        name: 'reader',
        capabilities: ['User|read|*', '!Secret|read|*'],
      };
      const ability = buildAbility([readerRole]);
      const authorizer = new CaslAuthorizer(ability);

      expect(authorizer.authorize('read', 'User')).toBe('User');

      expect(() => authorizer.authorize('read', 'Secret')).toThrow(
        UnauthorizedActionException,
      );
    });

    it('handles string subjects with create and delete actions', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);

      expect(authorizer.authorize('create', 'User')).toBe('User');

      expect(() => authorizer.authorize('delete', 'Post')).toThrow(
        UnauthorizedActionException,
      );
    });

    it('supports 4-arg explicit actor/ability: authorize(ability, action, subject, fields?)', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer();
      const user = new User(2, 'engineering', 'alice');

      expect(() =>
        authorizer.authorize(ability, 'update', user, ['username']),
      ).not.toThrow();

      expect(() =>
        authorizer.authorize(ability, 'update', user, ['department']),
      ).toThrow(UnauthorizedActionException);
    });

    it('rejects the removed actor-first form instead of guessing at it', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);
      const user = new User(2, 'engineering', 'alice');
      const userContext: CaslUserContext = { id: 1, department: 'engineering' };

      // An actor value cannot be converted into an ability, so the form never
      // did what its name implied. Rejecting it is clearer than silently using
      // the ambient ability under an actor-shaped call.
      expect(() =>
        (authorizer.authorize as unknown as (...a: unknown[]) => unknown)(
          userContext,
          'update',
          user,
          ['username'],
        ),
      ).toThrow(TypeError);
    });

    it('does not misread a three-argument string-actor call as (action, subject, fields)', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);
      const user = new User(2, 'engineering', 'alice');

      expect(() =>
        (authorizer.authorize as unknown as (...a: unknown[]) => unknown)(
          'actor-1',
          'update',
          user,
        ),
      ).toThrow(TypeError);
    });

    it('still accepts an explicit ability and an explicit bypass', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const user = new User(2, 'engineering', 'alice');
      const emptyAuthorizer = new CaslAuthorizer();

      expect(() =>
        emptyAuthorizer.authorize(ability, 'update', user, ['username']),
      ).not.toThrow();

      expect(
        emptyAuthorizer.authorize({ bypass: true }, 'update', user),
      ).toEqual({
        id: 2,
        department: 'engineering',
        username: 'alice',
      });
    });

    it('correctly dispatches custom non-standard actions with 3-arg signature (e.g. publish, Article, fields)', () => {
      const publisherRole: RoleDefinition = {
        name: 'publisher',
        capabilities: ['Article|publish|*|title', '!Article|publish|*|body'],
      };
      const ability = buildAbility([publisherRole]);
      const authorizer = new CaslAuthorizer(ability);

      // Custom action 'publish' with allowed field 'title'
      expect(authorizer.authorize('publish', 'Article', ['title'])).toBe(
        'Article',
      );

      // Custom action 'publish' with forbidden field 'body'
      expect(() =>
        authorizer.authorize('publish', 'Article', ['body']),
      ).toThrow(UnauthorizedActionException);

      // Custom action without fields
      const customRole: RoleDefinition = {
        name: 'archivist',
        capabilities: ['Document|archive|*'],
      };
      const archivistAbility = buildAbility([customRole]);
      const archivistAuthorizer = new CaslAuthorizer(archivistAbility);

      expect(archivistAuthorizer.authorize('archive', 'Document')).toBe(
        'Document',
      );
    });

    it('supports buildBypassAbility() for unrestricted operations', () => {
      const ability = buildBypassAbility();
      expect(ability.can('create', 'User')).toBe(true);
      expect(ability.can('delete', 'Post')).toBe(true);
      expect(ability.can('manage', 'all')).toBe(true);

      const authorizer = new CaslAuthorizer(ability);
      const user = new User(10, 'support', 'dave');
      expect(authorizer.authorize('update', user)).toEqual({
        id: 10,
        department: 'support',
        username: 'dave',
      });
    });

    it('supports entity without toJSON() in authorize', () => {
      const ability = buildAbility([
        {
          name: 'itemAdmin',
          capabilities: ['EntityWithoutToJSON|update|*'],
        },
      ]);
      const authorizer = new CaslAuthorizer(ability);
      const item = new EntityWithoutToJSON(10, 'Widget');

      const res = authorizer.authorize('update', item);
      expect(res).toBe(item);
    });

    it('resolves entityId from entity.id or entityRecord.id', () => {
      const ability = buildAbility([
        {
          name: 'admin',
          capabilities: ['!Item|delete|*'],
        },
      ]);
      const authorizer = new CaslAuthorizer(ability);

      // plain object with id
      try {
        authorizer.authorize('delete', { id: 99 });
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect((err as UnauthorizedActionException).entityId).toBe(99);
      }

      // plain object without id
      try {
        authorizer.authorize('delete', { name: 'no-id' });
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect((err as UnauthorizedActionException).entityId).toBeUndefined();
      }
    });
  });

  describe('filter()', () => {
    it('returns empty array when input is empty or null', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);

      expect(authorizer.filter('read', [])).toEqual([]);
      expect(authorizer.filter('read', [null, undefined])).toEqual([]);
    });

    it('filters out forbidden entities and projects readable fields on allowed entities', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);

      const userEng1 = new User(1, 'engineering', 'alice');
      const userMkt = new User(2, 'marketing', 'bob');
      const userEng2 = new User(3, 'engineering', 'charlie');

      const results = authorizer.filter<Record<string, unknown>>('read', [
        userEng1,
        userMkt,
        null,
        userEng2,
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: 1,
        department: 'engineering',
        username: 'alice',
      });
      expect(results[1]).toEqual({
        id: 3,
        department: 'engineering',
        username: 'charlie',
      });
    });

    it('returns all items when authorizer is in bypass mode', () => {
      const bypassAuthorizer = CaslAuthorizer.bypass();
      const user1 = new User(1, 'engineering', 'alice');
      const user2 = new User(2, 'marketing', 'bob');

      const results = bypassAuthorizer.filter<Record<string, unknown>>('read', [
        user1,
        user2,
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: 1,
        department: 'engineering',
        username: 'alice',
      });
      expect(results[1]).toEqual({
        id: 2,
        department: 'marketing',
        username: 'bob',
      });
    });

    it('supports 3-arg signature with explicit ability: filter(ability, action, subjects)', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer();

      const userEng = new User(1, 'engineering', 'alice');
      const userMkt = new User(2, 'marketing', 'bob');

      const results = authorizer.filter<Record<string, unknown>>(
        ability,
        'read',
        [userEng, userMkt],
      );

      expect(results).toHaveLength(1);
      expect(results[0].username).toBe('alice');
    });

    it('re-throws non-UnauthorizedActionException error from authorize', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);
      vi.spyOn(authorizer, 'authorize').mockImplementation(() => {
        throw new TypeError('Unexpected failure');
      });

      expect(() =>
        authorizer.filter('read', [new User(1, 'engineering', 'alice')]),
      ).toThrow(TypeError);
    });
  });

  describe('UnauthorizedActionException', () => {
    it('generates default message with id and fields when reason is omitted', () => {
      const err = new UnauthorizedActionException({
        action: 'edit',
        subject: 'Document',
        entityId: 'doc-123',
        fields: ['title', 'content'],
      });

      expect(err.name).toBe('UnauthorizedActionException');
      expect(err.message).toBe(
        'Access denied: cannot execute "edit" on "Document" (id=doc-123) on fields: [title, content].',
      );
    });

    it('generates default message without id and without fields', () => {
      const err = new UnauthorizedActionException({
        action: 'create',
        subject: 'User',
      });

      expect(err.message).toBe(
        'Access denied: cannot execute "create" on "User".',
      );
    });
  });
});

describe('nested read projection', () => {
  class Account {
    id = 1;
    department = 'engineering';
    profile = {
      name: 'Alice',
      secret: 'private',
      address: { city: 'Athens', pin: '1234' },
    };
    contacts = [
      { name: 'Bob', secret: 'hidden' },
      { name: 'Carol', secret: 'hidden-too' },
    ];
  }

  it('removes denied descendants from otherwise readable objects and arrays', () => {
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'Account' },
      {
        action: 'read',
        subject: 'Account',
        inverted: true,
        fields: ['profile.secret', 'profile.address.pin', 'contacts.secret'],
      },
    ]);
    const account = new Account();
    const authorizer = new CaslAuthorizer(ability);
    expect(authorizer.can('read', account, 'profile.secret')).toBe(false);
    const result = authorizer.authorize('read', account);
    expect(result).toEqual({
      id: 1,
      department: 'engineering',
      profile: { name: 'Alice', address: { city: 'Athens' } },
      contacts: [{ name: 'Bob' }, { name: 'Carol' }],
    });
    expect(account.profile.secret).toBe('private');
    expect(account.contacts[0].secret).toBe('hidden');
  });

  it('includes explicitly allowed nested fields without requiring a parent grant', () => {
    const ability = buildAbilityFromRules([
      {
        action: 'read',
        subject: 'Account',
        fields: ['profile.name', 'contacts.name'],
      },
    ]);
    expect(
      new CaslAuthorizer(ability).authorize('read', new Account()),
    ).toEqual({
      profile: { name: 'Alice' },
      contacts: [{ name: 'Bob' }, { name: 'Carol' }],
    });
  });

  it('supports explicit descendant wildcards with nested restrictions', () => {
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'Account', fields: ['profile.**'] },
      {
        action: 'read',
        subject: 'Account',
        fields: ['profile.secret'],
        inverted: true,
      },
    ]);
    expect(
      new CaslAuthorizer(ability).authorize('read', new Account()),
    ).toEqual({
      profile: { name: 'Alice', address: { city: 'Athens', pin: '1234' } },
    });
  });

  it('evaluates conditional wildcard denials against the original entity', () => {
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'Account' },
      {
        action: 'read',
        subject: 'Account',
        fields: ['profile.*'],
        inverted: true,
        conditions: { department: 'engineering' },
      },
    ]);
    const result = new CaslAuthorizer(ability).authorize<
      Record<string, unknown>
    >('read', new Account());
    expect(result).not.toHaveProperty('profile');
  });

  it('does not let a parent grant override a denied leaf', () => {
    const ability = buildAbilityFromRules([
      {
        action: 'read',
        subject: 'Account',
        fields: ['profile.secret'],
        inverted: true,
      },
      { action: 'read', subject: 'Account', fields: ['profile'] },
    ]);
    const account = new Account();
    const authorizer = new CaslAuthorizer(ability);
    expect(authorizer.can('read', account, 'profile.secret')).toBe(false);
    expect(authorizer.authorize('read', account)).toEqual({
      profile: {
        name: 'Alice',
        address: { city: 'Athens', pin: '1234' },
      },
    });
  });

  it('applies indexed restrictions without shifting array positions', () => {
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'Account' },
      {
        action: 'read',
        subject: 'Account',
        fields: ['contacts.0'],
        inverted: true,
      },
    ]);
    const result = new CaslAuthorizer(ability).authorize<
      Record<string, unknown>
    >('read', new Account());
    expect(result.contacts).toEqual([
      null,
      { name: 'Carol', secret: 'hidden-too' },
    ]);
  });

  it('keeps values when the nested denial condition does not match', () => {
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'Account' },
      {
        action: 'read',
        subject: 'Account',
        fields: ['profile.secret'],
        inverted: true,
        conditions: { department: 'sales' },
      },
    ]);
    const account = new Account();
    expect(new CaslAuthorizer(ability).authorize('read', account)).toEqual(
      account,
    );
  });

  it('masks nested toJSON snapshots and preserves readable dates and empty values', () => {
    const account = Object.assign(new Account(), {
      extra: { toJSON: () => ({ public: true, secret: 'hidden' }) },
      empty: [],
      nullable: null,
      date: new Date('2026-01-01T00:00:00Z'),
    });
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'Account' },
      {
        action: 'read',
        subject: 'Account',
        fields: ['extra.secret'],
        inverted: true,
      },
    ]);
    const result = new CaslAuthorizer(ability).authorize<
      Record<string, unknown>
    >('read', account);
    expect(result.extra).toEqual({ public: true });
    expect(result.empty).toEqual([]);
    expect(result.nullable).toBeNull();
    expect(result.date).toEqual(account.date);
  });

  it('rejects cycles instead of returning unfiltered object references', () => {
    const account = Object.assign(new Account(), {
      loop: {} as Record<string, unknown>,
    });
    account.loop.self = account.loop;
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'Account' },
    ]);
    expect(() =>
      new CaslAuthorizer(ability).authorize('read', account),
    ).toThrow(/cyclic/);
  });
  it('checks mixed named and indexed paths through nested arrays', () => {
    const account = Object.assign(new Account(), {
      groups: [{ members: [{ name: 'Alice', secret: 'hidden' }] }],
    });
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'Account' },
      {
        action: 'read',
        subject: 'Account',
        inverted: true,
        fields: ['groups.0.members.secret'],
      },
    ]);
    const result = new CaslAuthorizer(ability).authorize<
      Record<string, unknown>
    >('read', account);
    expect(result.groups).toEqual([{ members: [{ name: 'Alice' }] }]);
  });

  it('throws TypeError when array path aliases exceed limit', () => {
    let deeplyNested: any = [1];
    for (let i = 10; i >= 0; i--) {
      const arr = new Array(i + 1);
      arr[i] = deeplyNested;
      deeplyNested = arr;
    }
    const account = Object.assign(new Account(), {
      matrix: deeplyNested,
    });
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'Account' },
    ]);
    expect(() =>
      new CaslAuthorizer(ability).authorize('read', account),
    ).toThrow(/Authorization snapshot has too many array path aliases/);
  });
});

describe('CaslAuthorizer.authorize with select options', () => {
  class Profile {
    constructor(
      public readonly id: string,
      public readonly username: string,
      public readonly email: string,
      public readonly bio: string | null,
      public readonly secretToken: string,
      public readonly department: string,
    ) {}

    toJSON() {
      return {
        id: this.id,
        username: this.username,
        email: this.email,
        bio: this.bio,
        secretToken: this.secretToken,
        department: this.department,
      };
    }
  }

  it('restricts returned fields to the requested selection allowlist', () => {
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'Profile' },
    ]);
    const authorizer = new CaslAuthorizer(ability);
    const profile = new Profile(
      'p-1',
      'alice',
      'alice@example.com',
      null,
      'super-secret',
      'engineering',
    );

    const result = authorizer.authorize('read', profile, {
      select: ['username', 'bio'],
    });

    expect(result).toEqual({
      username: 'alice',
      bio: null,
    });
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('secretToken');
  });

  it('omits fields that are denied by CASL even if included in select', () => {
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'Profile' },
      { action: 'read', subject: 'Profile', fields: ['email'], inverted: true },
    ]);
    const authorizer = new CaslAuthorizer(ability);
    const profile = new Profile(
      'p-1',
      'alice',
      'alice@example.com',
      'Software engineer',
      'super-secret',
      'engineering',
    );

    const result = authorizer.authorize('read', profile, {
      select: ['username', 'email', 'bio'],
    });

    expect(result).toEqual({
      username: 'alice',
      bio: 'Software engineer',
    });
    expect(result).not.toHaveProperty('email');
  });

  it('evaluates instance-level conditions on the full entity before applying selection', () => {
    const ability = buildAbilityFromRules([
      {
        action: 'read',
        subject: 'Profile',
        conditions: { department: 'engineering' },
      },
    ]);
    const authorizer = new CaslAuthorizer(ability);
    const engineeringProfile = new Profile(
      'p-1',
      'alice',
      'alice@example.com',
      null,
      'token',
      'engineering',
    );
    const salesProfile = new Profile(
      'p-2',
      'bob',
      'bob@example.com',
      null,
      'token',
      'sales',
    );

    expect(
      authorizer.authorize('read', engineeringProfile, {
        select: ['username'],
      }),
    ).toEqual({ username: 'alice' });

    expect(() =>
      authorizer.authorize('read', salesProfile, { select: ['username'] }),
    ).toThrow(UnauthorizedActionException);
  });
});

describe('CaslAuthorizer.project', () => {
  class UserEntity {
    constructor(
      public readonly id: string,
      public readonly status: string,
    ) {}

    toJSON() {
      return { id: this.id, status: this.status };
    }
  }

  it('projects candidate data using subject permissions without mutating inputs', () => {
    const ability = buildAbilityFromRules([
      {
        action: 'read',
        subject: 'UserEntity',
        conditions: { status: 'active' },
      },
      {
        action: 'read',
        subject: 'UserEntity',
        fields: ['roles.0', 'sensitiveData'],
        inverted: true,
      },
    ]);
    const authorizer = new CaslAuthorizer(ability);
    const user = new UserEntity('u-1', 'active');
    const candidate = {
      id: 'u-1',
      roles: ['admin', 'viewer'],
      sensitiveData: 'classified',
      profile: { name: 'Alice' },
    };

    const projected = authorizer.project('read', user, candidate);

    expect(projected).toEqual({
      id: 'u-1',
      roles: [null, 'viewer'],
      profile: { name: 'Alice' },
    });
    expect(projected).not.toHaveProperty('sensitiveData');

    expect(candidate.roles[0]).toBe('admin');
    expect(candidate.sensitiveData).toBe('classified');
    expect(user.status).toBe('active');
  });

  it('fails closed when subject condition is not satisfied', () => {
    const ability = buildAbilityFromRules([
      {
        action: 'read',
        subject: 'UserEntity',
        conditions: { status: 'active' },
      },
    ]);
    const authorizer = new CaslAuthorizer(ability);
    const suspendedUser = new UserEntity('u-2', 'suspended');
    const candidate = { id: 'u-2', roles: ['viewer'] };

    expect(() => authorizer.project('read', suspendedUser, candidate)).toThrow(
      UnauthorizedActionException,
    );
  });

  it('fails closed when ability is absent', () => {
    const authorizer = new CaslAuthorizer();
    const user = new UserEntity('u-1', 'active');
    const candidate = { id: 'u-1', roles: ['viewer'] };

    expect(() => authorizer.project('read', user, candidate)).toThrow(
      UnauthorizedActionException,
    );
  });

  it('returns candidate snapshot in bypass mode', () => {
    const authorizer = new CaslAuthorizer({ bypass: true });
    const user = new UserEntity('u-1', 'suspended');
    const candidate = { id: 'u-1', roles: ['admin'] };

    const result = authorizer.project('read', user, candidate);
    expect(result).toEqual(candidate);
  });
});

describe('hasEntityConditions', () => {
  it('detects conditions on targeted subjects', () => {
    const ability = buildAbilityFromRules([
      {
        action: 'read',
        subject: 'User',
        conditions: { department: 'engineering' },
      },
      { action: 'read', subject: 'Role' },
    ]);

    expect(hasEntityConditions(ability, ['User', 'Role'])).toBe(true);
  });

  it('detects conditions on global all subject', () => {
    const ability = buildAbilityFromRules([
      {
        action: 'read',
        subject: 'all',
        conditions: { isPublic: true },
      },
    ]);

    expect(hasEntityConditions(ability, ['User', 'Role'])).toBe(true);
  });

  it('returns false when targeted rules have no conditions', () => {
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'User' },
      { action: 'read', subject: 'Role' },
      {
        action: 'read',
        subject: 'Document',
        conditions: { ownerId: 42 },
      },
    ]);

    expect(hasEntityConditions(ability, ['User', 'Role'])).toBe(false);
  });
});

describe('CaslAuthorizer selection and projection contracts', () => {
  class Doc {
    constructor(
      public readonly id: string,
      public readonly tags: string[],
      public readonly status: string,
      public readonly owner: string | null,
    ) {}

    toJSON() {
      return {
        id: this.id,
        tags: this.tags,
        status: this.status,
        owner: this.owner,
      };
    }
  }

  const doc = () => new Doc('d-1', ['a', 'b'], 'open', null);
  const readDoc = buildAbilityFromRules([{ action: 'read', subject: 'Doc' }]);

  it('applies descendant masks to selected array properties', () => {
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'Doc' },
      { action: 'read', subject: 'Doc', fields: ['tags.0'], inverted: true },
    ]);

    const result = new CaslAuthorizer(ability).authorize('read', doc(), {
      select: ['tags', 'owner'],
    });

    expect(result).toEqual({ tags: [null, 'b'], owner: null });
    expectTypeOf(result.tags).toEqualTypeOf<(string | null)[] | undefined>();
  });

  it('returns selection results whose types can omit every selected property', () => {
    const result = new CaslAuthorizer(readDoc).authorize('read', doc(), {
      select: ['id', 'owner'] as const,
    });

    expectTypeOf(result.id).toEqualTypeOf<string | undefined>();
    expectTypeOf(result.owner).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(result).not.toHaveProperty('tags');
  });

  it('rejects selection keys that are not properties of the entity', () => {
    const authorizer = new CaslAuthorizer(readDoc);

    expect(() =>
      // @ts-expect-error 'missing' is not a key of Doc
      authorizer.authorize('read', doc(), { select: ['missing'] }),
    ).not.toThrow();
  });

  it('does not select prototype members', () => {
    const result = (
      new CaslAuthorizer(readDoc) as unknown as {
        authorize: (...args: unknown[]) => Record<string, unknown>;
      }
    ).authorize('read', doc(), { select: ['id', 'toString', 'constructor'] });

    expect(Object.keys(result)).toEqual(['id']);
  });

  it('rejects selection on non-read actions instead of returning the entity', () => {
    const ability = buildAbilityFromRules([
      { action: 'update', subject: 'Doc' },
    ]);
    const authorizer = new CaslAuthorizer(ability) as unknown as {
      authorize: (...args: unknown[]) => unknown;
    };

    expect(() =>
      authorizer.authorize('update', doc(), { select: ['id'] }),
    ).toThrow(TypeError);
  });

  it('rejects malformed selection options instead of returning the entity', () => {
    const authorizer = new CaslAuthorizer(readDoc) as unknown as {
      authorize: (...args: unknown[]) => unknown;
    };

    expect(() => authorizer.authorize('read', doc(), { select: 'id' })).toThrow(
      TypeError,
    );
    expect(() => authorizer.authorize('read', doc(), 'id')).toThrow(TypeError);
  });

  it('fails closed for a selecting read without an ability', () => {
    expect(() =>
      new CaslAuthorizer().authorize('read', doc(), { select: ['id'] }),
    ).toThrow(UnauthorizedActionException);
  });

  it('selects from an explicit bypass without an ability', () => {
    expect(
      new CaslAuthorizer().authorize({ bypass: true }, 'read', doc(), {
        select: ['id', 'owner'],
      }),
    ).toEqual({ id: 'd-1', owner: null });
  });

  it('projects by the requested action rather than always by read rules', () => {
    const ability = buildAbilityFromRules([
      { action: 'update', subject: 'Doc', fields: ['tags'] },
      { action: 'read', subject: 'Doc', fields: ['id'] },
    ]);
    const authorizer = new CaslAuthorizer(ability);
    const candidate = { id: 'd-1', tags: ['x'] };

    expect(authorizer.project('update', doc(), candidate)).toEqual({
      tags: ['x'],
    });
    expect(authorizer.project('read', doc(), candidate)).toEqual({
      id: 'd-1',
    });
  });

  it('evaluates projection conditions on the loaded subject, not the candidate', () => {
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'Doc', conditions: { status: 'open' } },
    ]);
    const authorizer = new CaslAuthorizer(ability);

    expect(
      authorizer.project('read', doc(), { status: 'closed', id: 'd-1' }),
    ).toEqual({ status: 'closed', id: 'd-1' });
    expect(() =>
      authorizer.project('read', new Doc('d-2', [], 'closed', null), {
        status: 'open',
      }),
    ).toThrow(UnauthorizedActionException);
  });

  it('types projected candidates so masked properties and array items may be absent', () => {
    type Candidate = { id: string; roles: string[]; at: Date };

    expectTypeOf<Projected<Candidate>>().toEqualTypeOf<{
      id?: string;
      roles?: (string | null)[];
      at?: Date;
    }>();
  });

  it('accepts the named options type for equivalent constructions', () => {
    const options: CaslAuthorizerOptions = { bypass: true };

    expect(new CaslAuthorizer(options).can('read', 'Anything')).toBe(true);
    expect(new CaslAuthorizer(readDoc, options).can('read', 'Anything')).toBe(
      true,
    );
    expect(new CaslAuthorizer({}).can('read', 'Doc')).toBe(false);
    expect(new CaslAuthorizer(readDoc, {}).can('read', 'Doc')).toBe(true);
  });
});

describe('hasEntityConditions by action', () => {
  const ability = buildAbilityFromRules([
    { action: 'read', subject: 'User' },
    { action: 'update', subject: 'User', conditions: { id: 'u-1' } },
  ]);

  it('ignores conditional rules for other actions', () => {
    expect(hasEntityConditions(ability, ['User'], 'read')).toBe(false);
    expect(hasEntityConditions(ability, ['User'], 'update')).toBe(true);
    expect(hasEntityConditions(ability, ['User'])).toBe(true);
  });

  it('treats conditional manage rules as affecting every action', () => {
    const managed = buildAbilityFromRules([
      { action: 'manage', subject: 'User', conditions: { id: 'u-1' } },
    ]);

    expect(hasEntityConditions(managed, ['User'], 'read')).toBe(true);
  });

  it('matches conditional rules declared for all subjects', () => {
    const all = buildAbilityFromRules([
      { action: ['read'], subject: 'all', conditions: { public: true } },
    ]);

    expect(hasEntityConditions(all, ['User'], 'read')).toBe(true);
  });
});

describe('UnauthorizedActionException', () => {
  it('reports a numeric zero entity id', () => {
    expect(
      new UnauthorizedActionException({
        action: 'read',
        subject: 'Doc',
        entityId: 0,
      }).message,
    ).toContain('id=0');
  });
});
