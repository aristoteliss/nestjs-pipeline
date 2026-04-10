/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: false posotive */
import { describe, expect, it } from 'vitest';
import { StaticRoleProvider } from './providers/static-role.provider';
import {
  buildAbility,
  buildAbilityFromRules,
} from './services/ability.factory';
import type { CaslUserContext, RoleDefinition } from './types/casl.types';

const adminRole: RoleDefinition = {
  name: 'admin',
  capabilities: ['all|manage|*'],
};

const authorRole: RoleDefinition = {
  name: 'author',
  capabilities: [
    'Post|read|*',
    'Post|create|*',
    'Post|update|{"authorId":"${id}"}',
    'Post|delete|{"authorId":"${id}"}',
    'Comment|read|*',
    'Comment|create|*',
  ],
};

const viewerRole: RoleDefinition = {
  name: 'viewer',
  capabilities: ['Post|read|*', 'Comment|read|*'],
};

describe('buildAbility', () => {
  const adminUser: CaslUserContext = { id: 1 };
  const authorUser: CaslUserContext = { id: 2 };

  it('should grant admin full access', () => {
    const ability = buildAbility([adminRole], adminUser);
    expect(ability.can('read', 'Post')).toBe(true);
    expect(ability.can('create', 'Post')).toBe(true);
    expect(ability.can('delete', 'User')).toBe(true);
    expect(ability.can('manage', 'all')).toBe(true);
  });

  it('should allow author to read any post', () => {
    const ability = buildAbility([authorRole], authorUser);
    expect(ability.can('read', 'Post')).toBe(true);
  });

  it('should allow author to create posts', () => {
    const ability = buildAbility([authorRole], authorUser);
    expect(ability.can('create', 'Post')).toBe(true);
  });

  it('should allow author to update own posts', () => {
    const ability = buildAbility([authorRole], authorUser);
    // Type-level check
    expect(ability.can('update', 'Post')).toBe(true);
    // Instance-level check — own post
    expect(
      ability.can('update', {
        __caslSubjectType__: 'Post',
        authorId: 2,
      } as never),
    ).toBe(true);
    // Instance-level check — other's post
    expect(
      ability.can('update', {
        __caslSubjectType__: 'Post',
        authorId: 99,
      } as never),
    ).toBe(false);
  });

  it('should deny author actions not in role', () => {
    const ability = buildAbility([authorRole], authorUser);
    expect(ability.can('delete', 'User')).toBe(false);
    expect(ability.can('manage', 'all')).toBe(false);
  });

  it('should allow viewer read-only access', () => {
    const ability = buildAbility([viewerRole], { id: 3 });
    expect(ability.can('read', 'Post')).toBe(true);
    expect(ability.can('read', 'Comment')).toBe(true);
    expect(ability.can('create', 'Post')).toBe(false);
    expect(ability.can('update', 'Post')).toBe(false);
    expect(ability.can('delete', 'Post')).toBe(false);
  });

  it('should merge multiple roles', () => {
    const ability = buildAbility([viewerRole, authorRole], authorUser);
    expect(ability.can('read', 'Post')).toBe(true);
    expect(ability.can('create', 'Post')).toBe(true);
    expect(ability.can('create', 'Comment')).toBe(true);
  });

  it('should add per-user additional capabilities', () => {
    const ability = buildAbility(
      [viewerRole],
      { id: 3 },
      // This viewer also gets special create permission
      [{ subject: 'Post', action: 'create' }],
    );
    expect(ability.can('read', 'Post')).toBe(true);
    expect(ability.can('create', 'Post')).toBe(true);
    expect(ability.can('update', 'Post')).toBe(false);
  });

  it('should apply per-user denied capabilities', () => {
    const ability = buildAbility(
      [authorRole],
      authorUser,
      undefined,
      // Deny this author from deleting posts despite role allowing it
      [
        {
          subject: 'Post',
          action: 'delete',
          inverted: true,
          reason: 'Revoked',
        },
      ],
    );
    expect(ability.can('read', 'Post')).toBe(true);
    expect(ability.can('create', 'Post')).toBe(true);
    // Delete on own post should now be forbidden
    expect(
      ability.can('delete', {
        __caslSubjectType__: 'Post',
        authorId: 2,
      } as never),
    ).toBe(false);
  });
});

describe('buildAbilityFromRules', () => {
  it('should build ability from raw rules', () => {
    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'Post' },
      { action: 'create', subject: 'Comment' },
    ]);
    expect(ability.can('read', 'Post')).toBe(true);
    expect(ability.can('create', 'Comment')).toBe(true);
    expect(ability.can('delete', 'Post')).toBe(false);
  });
});

describe('StaticRoleProvider', () => {
  const provider = new StaticRoleProvider([adminRole, authorRole, viewerRole]);

  it('should return all roles', () => {
    const roles = provider.getRoles();
    expect(roles).toHaveLength(3);
    expect(roles.map((r) => r.name)).toEqual(['admin', 'author', 'viewer']);
  });

  it('should return roles by names', () => {
    const roles = provider.getRoles(['admin', 'viewer']);
    expect(roles).toHaveLength(2);
    expect(roles.map((r) => r.name)).toEqual(['admin', 'viewer']);
  });

  it('should skip unknown role names', () => {
    const roles = provider.getRoles(['admin', 'unknown']);
    expect(roles).toHaveLength(1);
    expect(roles[0].name).toBe('admin');
  });
});
