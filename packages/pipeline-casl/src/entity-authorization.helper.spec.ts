/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: false positive */
import { pipelineStore } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { CASL_ABILITY_KEY } from './constants/tokens';
import { UnauthorizedActionException } from './exceptions/unauthorized-action.exception';
import {
  CaslAuthorizer,
  CaslEntityAuthorizer,
  getCaslAbility,
} from './helpers/entity-authorization.helper';
import { buildAbility } from './services/ability.factory';
import type { CaslUserContext, RoleDefinition } from './types/casl.types';

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

describe('CaslAuthorizer / CaslEntityAuthorizer', () => {
  it('exports CaslEntityAuthorizer as backward compatibility alias', () => {
    expect(CaslEntityAuthorizer).toBe(CaslAuthorizer);
  });

  describe('can()', () => {
    it('returns true when no ability is available (safe default)', () => {
      const authorizer = new CaslAuthorizer();
      expect(authorizer.can('update', 'User')).toBe(true);
      expect(authorizer.can('update', 'User', { id: 1 })).toBe(true);
      expect(authorizer.can('update', 'User', { id: 1 }, 'username')).toBe(
        true,
      );
    });

    it('supports 4-arg legacy signature: can(action, subjectStr, entityRecord, field?)', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);

      // Allowed field
      expect(
        authorizer.can(
          'update',
          'User',
          { id: 2, department: 'engineering', username: 'bob' },
          'username',
        ),
      ).toBe(true);

      // Forbidden field
      expect(
        authorizer.can(
          'update',
          'User',
          { id: 2, department: 'engineering' },
          'department',
        ),
      ).toBe(false);

      // Without field parameter: allowed
      expect(
        authorizer.can('update', 'User', {
          id: 2,
          department: 'engineering',
        }),
      ).toBe(true);

      // Without field parameter: denied (wrong department)
      expect(
        authorizer.can('update', 'User', {
          id: 3,
          department: 'marketing',
        }),
      ).toBe(false);
    });

    it('supports 3-arg signature: can(action, entity, field)', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);
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
      // plain object has constructor.name === 'Object'
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
            'User',
            { id: 2, department: 'engineering' },
            'username',
          ),
        ).toBe(true);

        expect(
          authorizer.can(
            'update',
            'User',
            { id: 3, department: 'marketing' },
            'username',
          ),
        ).toBe(false);
      });
    });
  });

  describe('authorize()', () => {
    it('returns subject or subject.toJSON() when no ability is available', () => {
      const authorizer = new CaslAuthorizer();
      const entityWithToJSON = new User(5, 'engineering', 'eve');
      const plainObj = { id: 6, title: 'No toJSON' };
      const strSubject = 'User';

      expect(authorizer.authorize('update', entityWithToJSON)).toEqual({
        id: 5,
        department: 'engineering',
        username: 'eve',
      });
      expect(authorizer.authorize('update', plainObj)).toBe(plainObj);
      expect(authorizer.authorize('create', strSubject)).toBe('User');
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

    it('supports 4-arg with actor user context falling back to ambient/constructor ability', () => {
      const ability = buildAbility([supervisorRole], supervisor);
      const authorizer = new CaslAuthorizer(ability);
      const user = new User(2, 'engineering', 'alice');
      const userContext: CaslUserContext = { id: 1, department: 'engineering' };

      expect(() =>
        authorizer.authorize(userContext, 'update', user, ['username']),
      ).not.toThrow();

      // With actor string identifier (e.g. 'actor-1')
      expect(() =>
        authorizer.authorize('actor-1', 'update', user, ['username']),
      ).not.toThrow();

      // With actor user context and empty authorizer (no ability in store -> returns snapshot)
      const emptyAuthorizer = new CaslAuthorizer();
      expect(emptyAuthorizer.authorize(userContext, 'update', user)).toEqual({
        id: 2,
        department: 'engineering',
        username: 'alice',
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
