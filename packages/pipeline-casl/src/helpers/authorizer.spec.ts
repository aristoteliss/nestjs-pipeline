/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: placeholders are data */
import { subject as caslSubject, createMongoAbility } from '@casl/ability';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { CASL_ABILITY_KEY, CASL_PRINCIPAL_KEY } from '../constants/tokens';
import { UnauthorizedActionException } from '../errors/unauthorized-action.exception';
import type { AppAbility, AppRawRule, Projected } from '../types/casl.types';
import { buildAbility } from './ability';
import {
  CaslAuthorizer,
  getCaslAbility,
  getCaslPrincipal,
  hasEntityConditions,
} from './authorizer';

const rawAbility = (rules: AppRawRule[]): AppAbility =>
  createMongoAbility<[string, string]>(rules);

const contextWith = (items: [symbol, unknown][] = []): IPipelineContext =>
  ({ items: new Map<string | symbol, unknown>(items) }) as IPipelineContext;

class User {
  constructor(
    public readonly id: string,
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

const supervisor = { id: 'u-1', department: 'engineering' };
const supervisorRules = [
  'User|read|{"department":"${department}"}',
  'User|update|{"department":"${department}"}',
  'User|delete|{"department":"${department}"}',
  'User|create|*',
  '!User|update|*|department',
];

function caught(fn: () => unknown): UnauthorizedActionException {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(UnauthorizedActionException);
    return error as UnauthorizedActionException;
  }
  throw new Error('expected UnauthorizedActionException');
}

describe('getCaslAbility and getCaslPrincipal', () => {
  const ability = buildAbility(['User|read|*']);
  const principal = { id: 'u-1' };

  it('return undefined without an explicit or ambient context', () => {
    expect(getCaslAbility()).toBeUndefined();
    expect(getCaslPrincipal()).toBeUndefined();
  });

  it('read the explicit context', () => {
    const context = contextWith([
      [CASL_ABILITY_KEY, ability],
      [CASL_PRINCIPAL_KEY, principal],
    ]);

    expect(getCaslAbility(context)).toBe(ability);
    expect(getCaslPrincipal(context)).toBe(principal);
  });

  it('read the ambient pipeline store', () => {
    const context = contextWith([
      [CASL_ABILITY_KEY, ability],
      [CASL_PRINCIPAL_KEY, principal],
    ]);

    pipelineStore.run(context, () => {
      expect(getCaslAbility()).toBe(ability);
      expect(getCaslPrincipal()).toBe(principal);
    });
  });
});

describe('CaslAuthorizer', () => {
  describe('subject typing', () => {
    it('honours the type of a value already tagged by CASL subject()', () => {
      const authorizer = new CaslAuthorizer(
        buildAbility(['UserCapabilities|read|*']),
      );

      expect(
        authorizer.can(
          'read',
          caslSubject('UserCapabilities', { userId: '1' }),
        ),
      ).toBe(true);
      expect(
        authorizer.can('read', caslSubject('SomethingElse', { userId: '1' })),
      ).toBe(false);
    });

    it('evaluates conditions of a tagged subject against its own attributes', () => {
      const authorizer = new CaslAuthorizer(
        buildAbility(['UserCapabilities|read|{"userId":"self"}']),
      );

      expect(
        authorizer.can(
          'read',
          caslSubject('UserCapabilities', { userId: 'self' }),
        ),
      ).toBe(true);
      expect(
        authorizer.can(
          'read',
          caslSubject('UserCapabilities', { userId: 'other' }),
        ),
      ).toBe(false);
    });

    it('uses the constructor name of a plain class without toJSON', () => {
      const authorizer = new CaslAuthorizer(
        buildAbility(['EntityWithoutToJSON|read|{"title":"open"}']),
      );

      expect(authorizer.can('read', new EntityWithoutToJSON(1, 'open'))).toBe(
        true,
      );
      expect(authorizer.can('read', new EntityWithoutToJSON(2, 'closed'))).toBe(
        false,
      );
    });
  });

  describe('can', () => {
    const authorizer = new CaslAuthorizer(
      buildAbility(supervisorRules, supervisor),
    );

    it('returns true for a permitted action', () => {
      expect(
        authorizer.can('read', new User('u-2', 'engineering', 'bob')),
      ).toBe(true);
      expect(authorizer.can('create', 'User')).toBe(true);
    });

    it('returns false for a denied action', () => {
      expect(authorizer.can('read', new User('u-3', 'sales', 'carol'))).toBe(
        false,
      );
      expect(authorizer.can('publish', 'User')).toBe(false);
    });

    it('checks a single field', () => {
      const user = new User('u-2', 'engineering', 'bob');

      expect(authorizer.can('update', user, 'username')).toBe(true);
      expect(authorizer.can('update', user, 'department')).toBe(false);
    });

    it('returns false without an ability', () => {
      expect(new CaslAuthorizer().can('read', 'User')).toBe(false);
    });

    it('uses the ambient ability when none is given to the constructor', () => {
      const context = contextWith([
        [CASL_ABILITY_KEY, buildAbility(['User|read|*'])],
      ]);

      pipelineStore.run(context, () => {
        expect(new CaslAuthorizer().can('read', 'User')).toBe(true);
      });
    });
  });

  describe('authorize', () => {
    const ability = buildAbility(supervisorRules, supervisor);
    const authorizer = new CaslAuthorizer(ability);

    it('throws when the entity is denied', () => {
      const error = caught(() =>
        authorizer.authorize('delete', new User('u-3', 'sales', 'carol')),
      );

      expect(error.action).toBe('delete');
      expect(error.subject).toBe('User');
      expect(error.entityId).toBe('u-3');
      expect(error.fields).toBeUndefined();
      expect(error.message).toBe(
        'Access denied: insufficient permissions to delete User.',
      );
    });

    it('passes when a conditional rule matches and throws when it does not', () => {
      expect(() =>
        authorizer.authorize('update', new User('u-2', 'engineering', 'bob')),
      ).not.toThrow();
      expect(() =>
        authorizer.authorize('update', new User('u-3', 'sales', 'carol')),
      ).toThrow(UnauthorizedActionException);
    });

    it('checks the entity before any field', () => {
      const error = caught(() =>
        authorizer.authorize('update', new User('u-3', 'sales', 'carol'), [
          'username',
        ]),
      );

      expect(error.fields).toBeUndefined();
    });

    it('checks each field and reports the first denied one', () => {
      const error = caught(() =>
        authorizer.authorize('update', new User('u-2', 'engineering', 'bob'), [
          'username',
          'department',
          'email',
        ]),
      );

      expect(error.fields).toEqual(['department']);
      expect(error.message).toBe(
        'Access denied: insufficient permissions to update User field "department".',
      );
    });

    it('checks the entity only for empty or absent fields', () => {
      const user = new User('u-2', 'engineering', 'bob');

      expect(() => authorizer.authorize('update', user, [])).not.toThrow();
      expect(() => authorizer.authorize('update', user)).not.toThrow();
    });

    it('checks read fields', () => {
      const reader = new CaslAuthorizer(
        buildAbility(['User|read|*', '!User|read|*|email']),
      );

      expect(() =>
        reader.authorize('read', 'User', ['username']),
      ).not.toThrow();
      expect(
        caught(() => reader.authorize('read', 'User', ['email'])).fields,
      ).toEqual(['email']);
    });

    it('denies with the no-ability reason when no ability is present', () => {
      const error = caught(() =>
        new CaslAuthorizer().authorize('read', new User('u-2', 'x', 'bob')),
      );

      expect(error.message).toBe(
        'Access denied: insufficient permissions to read User (no authorization ability present in context).',
      );
    });

    it('uses the constructor ability over the ambient one', () => {
      const context = contextWith([
        [CASL_ABILITY_KEY, buildAbility(['!User|read|*'])],
      ]);

      pipelineStore.run(context, () => {
        expect(() =>
          new CaslAuthorizer(buildAbility(['User|read|*'])).authorize(
            'read',
            'User',
          ),
        ).not.toThrow();
        expect(() => new CaslAuthorizer().authorize('read', 'User')).toThrow(
          UnauthorizedActionException,
        );
      });
    });

    it('returns nothing', () => {
      expect(authorizer.authorize('create', 'User')).toBeUndefined();
      expectTypeOf(authorizer.authorize).returns.toBeVoid();
    });

    it('does not mutate the subject', () => {
      const user = new User('u-2', 'engineering', 'bob');
      const before = JSON.stringify(user);

      authorizer.authorize('update', user, ['username']);

      expect(JSON.stringify(user)).toBe(before);
      expect(Object.keys(user)).toEqual(['id', 'department', 'username']);
    });

    it('reports the entity id from the instance or its snapshot', () => {
      const denyAll = new CaslAuthorizer(buildAbility(['Post|read|*']));
      const snapshotOnly = {
        toJSON: () => ({ id: 'snap-1' }),
      };

      expect(
        caught(() => denyAll.authorize('read', new EntityWithoutToJSON(0, 't')))
          .entityId,
      ).toBe(0);
      expect(
        caught(() => denyAll.authorize('read', snapshotOnly)).entityId,
      ).toBe('snap-1');
    });
  });

  describe('project', () => {
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

    const readAccount = (ability: AppAbility, account = new Account()) =>
      new CaslAuthorizer(ability).project('read', account, account);

    it('throws when the entity is denied', () => {
      const authorizer = new CaslAuthorizer(
        buildAbility(['User|read|{"department":"sales"}']),
      );

      expect(() =>
        authorizer.project('read', new User('u-2', 'engineering', 'bob'), {
          id: 'u-2',
        }),
      ).toThrow(UnauthorizedActionException);
    });

    it('fails closed without an ability', () => {
      expect(() =>
        new CaslAuthorizer().project('read', new User('u-1', 'x', 'a'), {
          id: 'u-1',
        }),
      ).toThrow(UnauthorizedActionException);
    });

    it('rejects a non-object candidate', () => {
      const authorizer = new CaslAuthorizer(buildAbility(['User|read|*']));

      expect(() =>
        authorizer.project('read', 'User', null as unknown as object),
      ).toThrow(TypeError);
    });

    it('evaluates conditions on the subject, not the candidate', () => {
      const authorizer = new CaslAuthorizer(
        buildAbility(['Doc|read|{"status":"open"}']),
      );
      const open = caslSubject('Doc', { id: 'd-1', status: 'open' });
      const closed = caslSubject('Doc', { id: 'd-2', status: 'closed' });

      expect(
        authorizer.project('read', open, { status: 'closed', id: 'd-1' }),
      ).toEqual({ status: 'closed', id: 'd-1' });
      expect(() =>
        authorizer.project('read', closed, { status: 'open' }),
      ).toThrow(UnauthorizedActionException);
    });

    it('projects candidate data using subject permissions without mutating inputs', () => {
      class UserEntity {
        constructor(
          public readonly id: string,
          public readonly status: string,
        ) {}

        toJSON() {
          return { id: this.id, status: this.status };
        }
      }
      const authorizer = new CaslAuthorizer(
        rawAbility([
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
        ]),
      );
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
      expect(candidate.roles[0]).toBe('admin');
      expect(candidate.sensitiveData).toBe('classified');
      expect(user.status).toBe('active');
    });

    it('projects by the requested action', () => {
      const authorizer = new CaslAuthorizer(
        buildAbility(['Doc|update|*|tags', 'Doc|read|*|id']),
      );
      const candidate = { id: 'd-1', tags: ['x'] };

      expect(authorizer.project('update', 'Doc', candidate)).toEqual({
        tags: ['x'],
      });
      expect(authorizer.project('read', 'Doc', candidate)).toEqual({
        id: 'd-1',
      });
    });

    it('masks unauthorized fields', () => {
      const authorizer = new CaslAuthorizer(
        buildAbility([
          'User|read|*|id',
          'User|read|*|username',
          '!User|read|*|department',
        ]),
      );
      const user = new User('u-2', 'engineering', 'alice');

      expect(authorizer.project('read', user, user)).toEqual({
        id: 'u-2',
        username: 'alice',
      });
    });

    it('authorizes a descendant through a granted parent, unlike can()', () => {
      const ability = buildAbility([
        { subject: 'Account', action: 'read', fields: ['profile'] },
      ]);
      const account = new Account();

      expect(
        new CaslAuthorizer(ability).can('read', account, 'profile.secret'),
      ).toBe(false);
      expect(readAccount(ability, account)).toEqual({
        profile: {
          name: 'Alice',
          secret: 'private',
          address: { city: 'Athens', pin: '1234' },
        },
      });
    });

    it('omits an explicitly denied child of a granted parent', () => {
      const ability = buildAbility([
        { subject: 'Account', action: 'read', fields: ['profile'] },
        {
          subject: 'Account',
          action: 'read',
          fields: ['profile.address'],
          inverted: true,
        },
      ]);

      expect(readAccount(ability)).toEqual({
        profile: { name: 'Alice', secret: 'private' },
      });
    });

    it('removes denied descendants from otherwise readable objects and arrays', () => {
      const ability = rawAbility([
        { action: 'read', subject: 'Account' },
        {
          action: 'read',
          subject: 'Account',
          inverted: true,
          fields: ['profile.secret', 'profile.address.pin', 'contacts.secret'],
        },
      ]);
      const account = new Account();

      expect(
        new CaslAuthorizer(ability).can('read', account, 'profile.secret'),
      ).toBe(false);
      expect(readAccount(ability, account)).toEqual({
        id: 1,
        department: 'engineering',
        profile: { name: 'Alice', address: { city: 'Athens' } },
        contacts: [{ name: 'Bob' }, { name: 'Carol' }],
      });
      expect(account.profile.secret).toBe('private');
      expect(account.contacts[0].secret).toBe('hidden');
    });

    it('includes explicitly allowed nested fields without requiring a parent grant', () => {
      const ability = rawAbility([
        {
          action: 'read',
          subject: 'Account',
          fields: ['profile.name', 'contacts.name'],
        },
      ]);

      expect(readAccount(ability)).toEqual({
        profile: { name: 'Alice' },
        contacts: [{ name: 'Bob' }, { name: 'Carol' }],
      });
    });

    it('supports explicit descendant wildcards with nested restrictions', () => {
      const ability = rawAbility([
        { action: 'read', subject: 'Account', fields: ['profile.**'] },
        {
          action: 'read',
          subject: 'Account',
          fields: ['profile.secret'],
          inverted: true,
        },
      ]);

      expect(readAccount(ability)).toEqual({
        profile: { name: 'Alice', address: { city: 'Athens', pin: '1234' } },
      });
    });

    it('evaluates conditional wildcard denials against the original entity', () => {
      const ability = rawAbility([
        { action: 'read', subject: 'Account' },
        {
          action: 'read',
          subject: 'Account',
          fields: ['profile.*'],
          inverted: true,
          conditions: { department: 'engineering' },
        },
      ]);

      expect(readAccount(ability)).not.toHaveProperty('profile');
    });

    it('does not let a later parent grant override an earlier denied leaf', () => {
      const ability = rawAbility([
        {
          action: 'read',
          subject: 'Account',
          fields: ['profile.secret'],
          inverted: true,
        },
        { action: 'read', subject: 'Account', fields: ['profile'] },
      ]);
      const account = new Account();

      expect(
        new CaslAuthorizer(ability).can('read', account, 'profile.secret'),
      ).toBe(false);
      expect(readAccount(ability, account)).toEqual({
        profile: { name: 'Alice', address: { city: 'Athens', pin: '1234' } },
      });
    });

    it('applies indexed restrictions without shifting array positions', () => {
      const ability = rawAbility([
        { action: 'read', subject: 'Account' },
        {
          action: 'read',
          subject: 'Account',
          fields: ['contacts.0'],
          inverted: true,
        },
      ]);

      expect(readAccount(ability).contacts).toEqual([
        null,
        { name: 'Carol', secret: 'hidden-too' },
      ]);
    });

    it('keeps values when the nested denial condition does not match', () => {
      const ability = rawAbility([
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

      expect(readAccount(ability, account)).toEqual({ ...account });
    });

    it('masks nested toJSON snapshots and preserves readable dates and empty values', () => {
      const account = Object.assign(new Account(), {
        extra: { toJSON: () => ({ public: true, secret: 'hidden' }) },
        empty: [],
        nullable: null,
        date: new Date('2026-01-01T00:00:00Z'),
      });
      const ability = rawAbility([
        { action: 'read', subject: 'Account' },
        {
          action: 'read',
          subject: 'Account',
          fields: ['extra.secret'],
          inverted: true,
        },
      ]);

      const result = new CaslAuthorizer(ability).project(
        'read',
        account,
        account,
      );

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

      expect(() =>
        new CaslAuthorizer(
          rawAbility([{ action: 'read', subject: 'Account' }]),
        ).project('read', account, account),
      ).toThrow(/cyclic/);
    });

    it('checks mixed named and indexed paths through nested arrays', () => {
      const account = Object.assign(new Account(), {
        groups: [{ members: [{ name: 'Alice', secret: 'hidden' }] }],
      });
      const ability = rawAbility([
        { action: 'read', subject: 'Account' },
        {
          action: 'read',
          subject: 'Account',
          inverted: true,
          fields: ['groups.0.members.secret'],
        },
      ]);

      expect(
        new CaslAuthorizer(ability).project('read', account, account).groups,
      ).toEqual([{ members: [{ name: 'Alice' }] }]);
    });

    it('throws when array path aliases exceed the limit', () => {
      let deeplyNested: unknown = [1];
      for (let i = 10; i >= 0; i--) {
        const arr = new Array(i + 1);
        arr[i] = deeplyNested;
        deeplyNested = arr;
      }
      const account = Object.assign(new Account(), { matrix: deeplyNested });

      expect(() =>
        new CaslAuthorizer(
          rawAbility([{ action: 'read', subject: 'Account' }]),
        ).project('read', account, account),
      ).toThrow(/too many array path aliases/);
    });

    it('applies descendant masks to array properties', () => {
      const ability = buildAbility([
        'Doc|read|*',
        { subject: 'Doc', action: 'read', fields: ['tags.0'], inverted: true },
      ]);

      expect(
        new CaslAuthorizer(ability).project('read', 'Doc', {
          tags: ['a', 'b'],
          owner: null,
        }),
      ).toEqual({ tags: [null, 'b'], owner: null });
    });

    it('types projected candidates so every property and array item may be absent', () => {
      type Candidate = { id: string; roles: string[]; at: Date };

      expectTypeOf<Projected<Candidate>>().toEqualTypeOf<{
        id?: string;
        roles?: (string | null)[];
        at?: Date;
      }>();
      expectTypeOf<
        Projected<{ tags: readonly string[] }>['tags']
      >().toEqualTypeOf<(string | null)[] | undefined>();
    });
  });
});

describe('hasEntityConditions', () => {
  it('detects conditions on targeted subjects', () => {
    const ability = buildAbility([
      'User|read|{"department":"engineering"}',
      'Role|read|*',
    ]);

    expect(hasEntityConditions(ability, ['User', 'Role'])).toBe(true);
  });

  it('detects conditions on the global all subject', () => {
    const ability = buildAbility(['all|read|{"isPublic":true}']);

    expect(hasEntityConditions(ability, ['User', 'Role'])).toBe(true);
  });

  it('returns false when targeted rules have no conditions', () => {
    const ability = buildAbility([
      'User|read|*',
      'Role|read|*',
      'Document|read|{"ownerId":42}',
    ]);

    expect(hasEntityConditions(ability, ['User', 'Role'])).toBe(false);
  });

  it('ignores conditional rules for other actions', () => {
    const ability = buildAbility(['User|read|*', 'User|update|{"id":"u-1"}']);

    expect(hasEntityConditions(ability, ['User'], 'read')).toBe(false);
    expect(hasEntityConditions(ability, ['User'], 'update')).toBe(true);
    expect(hasEntityConditions(ability, ['User'])).toBe(true);
  });

  it('treats conditional manage rules as affecting every action', () => {
    const ability = buildAbility(['User|manage|{"id":"u-1"}']);

    expect(hasEntityConditions(ability, ['User'], 'read')).toBe(true);
  });

  it('matches conditional rules with action lists declared for all subjects', () => {
    const ability = rawAbility([
      { action: ['read'], subject: 'all', conditions: { public: true } },
    ]);

    expect(hasEntityConditions(ability, ['User'], 'read')).toBe(true);
  });
});

describe('UnauthorizedActionException', () => {
  it('generates the default message with id and fields when reason is omitted', () => {
    const error = new UnauthorizedActionException({
      action: 'edit',
      subject: 'Document',
      entityId: 'doc-123',
      fields: ['title', 'content'],
    });

    expect(error.name).toBe('UnauthorizedActionException');
    expect(error.message).toBe(
      'Access denied: cannot execute "edit" on "Document" (id=doc-123) on fields: [title, content].',
    );
  });

  it('generates the default message without id and fields', () => {
    expect(
      new UnauthorizedActionException({ action: 'create', subject: 'User' })
        .message,
    ).toBe('Access denied: cannot execute "create" on "User".');
  });

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
