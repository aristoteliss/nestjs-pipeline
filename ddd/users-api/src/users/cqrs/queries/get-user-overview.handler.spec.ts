/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MissingCachePartitionError } from '@nestjs-pipeline/cache';
import {
  buildAbility,
  buildAbilityFromRules,
  CASL_ABILITY_KEY,
  CASL_USER_CONTEXT_KEY,
  CaslAuthorizer,
  UnauthorizedActionException,
} from '@nestjs-pipeline/casl';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import { Role } from '../../../roles/domain/models/role.entity';
import { User } from '../../domain/models/user.entity';
import { GetUserOverviewHandler } from './get-user-overview.handler';
import { GetUserOverviewQuery } from './get-user-overview.query';
import {
  hasEntityDependentConditions,
  OVERVIEW_RESPONSE_POLICY_VERSION,
  userOverviewCacheCondition,
  userOverviewCacheKey,
} from './user-overview-cache.policy';

type RawRules = Parameters<typeof buildAbilityFromRules>[0];

function setup(options: {
  user?: User | null;
  rules: RawRules;
  assignments?: { roles: string[]; additionalCapabilities: string[] };
  roles?: Role[];
}) {
  const user =
    options.user === undefined
      ? User.create('Bob', 'bob@example.test', 'engineering')
      : options.user;
  const users = { find: vi.fn().mockResolvedValue(user) };
  const capabilities = {
    find: vi
      .fn()
      .mockResolvedValue(
        options.assignments ?? { roles: [], additionalCapabilities: [] },
      ),
  };
  const roles = { find: vi.fn().mockResolvedValue(options.roles ?? []) };
  const handler = new GetUserOverviewHandler(
    users as never,
    capabilities as never,
    roles as never,
    new CaslAuthorizer(buildAbilityFromRules(options.rules)),
  );
  const userId = (user ?? User.create('Ghost', 'ghost@example.test', null)).id;
  const run = () => handler.execute(new GetUserOverviewQuery({ userId }));

  return { user, users, capabilities, roles, run };
}

const readUser = { action: 'read', subject: 'User' } as const;
const readRole = { action: 'read', subject: 'Role' } as const;

describe('GetUserOverviewHandler', () => {
  it('composes profile, roles and capabilities when the viewer may read them', async () => {
    const { user, run } = setup({
      rules: [readUser, readRole],
      assignments: {
        roles: ['developer', 'operator'],
        additionalCapabilities: ['deploy:staging'],
      },
      roles: [Role.create('developer'), Role.create('operator')],
    });

    await expect(run()).resolves.toEqual({
      id: user?.id,
      username: 'Bob',
      email: 'bob@example.test',
      department: 'engineering',
      roles: ['developer', 'operator'],
      capabilities: ['deploy:staging'],
    });
  });

  it('returns only the profile without reading related data when nothing else is readable', async () => {
    const { capabilities, roles, run } = setup({
      rules: [
        readUser,
        {
          action: 'read',
          subject: 'User',
          fields: ['roles', 'capabilities'],
          inverted: true,
        },
      ],
      assignments: { roles: ['developer'], additionalCapabilities: ['a:b'] },
    });

    const result = await run();

    expect(result).not.toHaveProperty('roles');
    expect(result).not.toHaveProperty('capabilities');
    expect(capabilities.find).not.toHaveBeenCalled();
    expect(roles.find).not.toHaveBeenCalled();
  });

  it('omits fields the viewer cannot read and does not restore them from the aggregate', async () => {
    const { run } = setup({
      rules: [
        readUser,
        {
          action: 'read',
          subject: 'User',
          fields: ['email', 'department'],
          inverted: true,
        },
      ],
    });

    const result = await run();

    expect(result?.username).toBe('Bob');
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('department');
  });

  it('preserves an authorized null department', async () => {
    const user = User.create('Bob', 'bob@example.test', null);
    const { run } = setup({ user, rules: [readUser] });

    const result = await run();

    expect(result).toHaveProperty('department', null);
  });

  it('rejects an entity the viewer may not read before any related read', async () => {
    const { capabilities, roles, run } = setup({
      rules: [
        readRole,
        {
          action: 'read',
          subject: 'User',
          conditions: { department: 'sales' },
        },
      ],
      assignments: { roles: ['developer'], additionalCapabilities: [] },
    });

    await expect(run()).rejects.toThrow(UnauthorizedActionException);
    expect(capabilities.find).not.toHaveBeenCalled();
    expect(roles.find).not.toHaveBeenCalled();
  });

  it('returns null for a missing user without reading related data', async () => {
    const { capabilities, roles, run } = setup({
      user: null,
      rules: [readUser],
    });

    await expect(run()).resolves.toBeNull();
    expect(capabilities.find).not.toHaveBeenCalled();
    expect(roles.find).not.toHaveBeenCalled();
  });

  it('includes roles but omits capabilities when only capabilities are denied', async () => {
    const { capabilities, run } = setup({
      rules: [
        readUser,
        readRole,
        {
          action: 'read',
          subject: 'User',
          fields: ['capabilities'],
          inverted: true,
        },
      ],
      assignments: { roles: ['developer'], additionalCapabilities: ['a:b'] },
      roles: [Role.create('developer')],
    });

    const result = await run();

    expect(result?.roles).toEqual(['developer']);
    expect(result).not.toHaveProperty('capabilities');
    expect(capabilities.find).toHaveBeenCalled();
  });

  it('loads the user from primary persistence rather than a cached snapshot', async () => {
    const { users, run } = setup({ rules: [readUser] });

    await run();

    const [query] = users.find.mock.calls[0];
    expect(query.refresh).toBe(true);
  });

  it('omits an assigned role that cannot be loaded instead of trusting a type-level grant', async () => {
    const { run } = setup({
      rules: [readUser, readRole],
      assignments: {
        roles: ['ghost', 'developer'],
        additionalCapabilities: [],
      },
      roles: [Role.create('developer')],
    });

    const result = await run();

    expect(result?.roles).toEqual(['developer']);
  });

  it('filters assigned roles through loaded Role entity permissions', async () => {
    const user = User.create('Bob', 'bob@example.test', 'engineering');
    const roleDev = Role.create('developer');
    const roleAdmin = Role.create('admin');

    const mockUserRepo = {
      find: vi.fn().mockResolvedValue(user),
    };
    const mockCapabilitiesRepo = {
      find: vi.fn().mockResolvedValue({
        roles: ['developer', 'admin'],
        additionalCapabilities: [],
      }),
    };
    const mockRolesRepo = {
      find: vi.fn().mockResolvedValue([roleDev, roleAdmin]),
    };

    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'User' },
      { action: 'read', subject: 'Role', conditions: { name: 'developer' } },
    ]);
    const authorizer = new CaslAuthorizer(ability);

    const handler = new GetUserOverviewHandler(
      mockUserRepo as never,
      mockCapabilitiesRepo as never,
      mockRolesRepo as never,
      authorizer,
    );

    const result = await handler.execute(
      new GetUserOverviewQuery({ userId: user.id }),
    );

    expect(result?.roles).toEqual(['developer']);
    expect(mockRolesRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ names: ['developer', 'admin'] }),
    );
  });

  it('omits role names when the name field on the role entity is forbidden', async () => {
    const user = User.create('Bob', 'bob@example.test', 'engineering');
    const roleSecret = Role.create('classified-role');

    const mockUserRepo = {
      find: vi.fn().mockResolvedValue(user),
    };
    const mockCapabilitiesRepo = {
      find: vi.fn().mockResolvedValue({
        roles: ['classified-role'],
        additionalCapabilities: [],
      }),
    };
    const mockRolesRepo = {
      find: vi.fn().mockResolvedValue([roleSecret]),
    };

    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'User' },
      { action: 'read', subject: 'Role' },
      { action: 'read', subject: 'Role', fields: ['name'], inverted: true },
    ]);
    const authorizer = new CaslAuthorizer(ability);

    const handler = new GetUserOverviewHandler(
      mockUserRepo as never,
      mockCapabilitiesRepo as never,
      mockRolesRepo as never,
      authorizer,
    );

    const result = await handler.execute(
      new GetUserOverviewQuery({ userId: user.id }),
    );

    expect(result?.roles).toEqual([]);
  });

  it('applies descendant path masking on roles replacing denied index with null', async () => {
    const user = User.create('Bob', 'bob@example.test', 'engineering');
    const roleOperator = Role.create('operator');
    const roleViewer = Role.create('viewer');

    const mockUserRepo = {
      find: vi.fn().mockResolvedValue(user),
    };
    const mockCapabilitiesRepo = {
      find: vi.fn().mockResolvedValue({
        roles: ['operator', 'viewer'],
        additionalCapabilities: [],
      }),
    };
    const mockRolesRepo = {
      find: vi.fn().mockResolvedValue([roleOperator, roleViewer]),
    };

    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'User' },
      { action: 'read', subject: 'Role' },
      { action: 'read', subject: 'User', fields: ['roles.0'], inverted: true },
    ]);
    const authorizer = new CaslAuthorizer(ability);

    const handler = new GetUserOverviewHandler(
      mockUserRepo as never,
      mockCapabilitiesRepo as never,
      mockRolesRepo as never,
      authorizer,
    );

    const result = await handler.execute(
      new GetUserOverviewQuery({ userId: user.id }),
    );

    expect(result?.roles).toEqual([null, 'viewer']);
  });

  it('applies descendant path masking on capabilities replacing denied index with null', async () => {
    const user = User.create('Bob', 'bob@example.test', 'engineering');

    const mockUserRepo = {
      find: vi.fn().mockResolvedValue(user),
    };
    const mockCapabilitiesRepo = {
      find: vi.fn().mockResolvedValue({
        roles: [],
        additionalCapabilities: ['report:view', 'report:export'],
      }),
    };
    const mockRolesRepo = { find: vi.fn().mockResolvedValue([]) };

    const ability = buildAbilityFromRules([
      { action: 'read', subject: 'User' },
      { action: 'read', subject: 'Role' },
      {
        action: 'read',
        subject: 'User',
        fields: ['capabilities.0'],
        inverted: true,
      },
    ]);
    const authorizer = new CaslAuthorizer(ability);

    const handler = new GetUserOverviewHandler(
      mockUserRepo as never,
      mockCapabilitiesRepo as never,
      mockRolesRepo as never,
      authorizer,
    );

    const result = await handler.execute(
      new GetUserOverviewQuery({ userId: user.id }),
    );

    expect(result?.capabilities).toEqual([null, 'report:export']);
  });
});

describe('GetUserOverviewHandler caching and partitioning', () => {
  it('derives a partitioned cache key scoped by tenant, principal type, principal ID, permission scope, and payload', () => {
    const query = new GetUserOverviewQuery({ userId: 'u-123' });
    const ability = buildAbility([
      {
        name: 'reader',
        capabilities: [{ subject: 'User', action: 'read' }],
      },
    ]);

    const items = new Map<string | symbol, unknown>([
      [
        CASL_USER_CONTEXT_KEY,
        {
          id: 'principal-42',
          principalType: 'user',
          capabilities: { roles: ['reader'] },
        },
      ],
      [CASL_ABILITY_KEY, ability],
    ]);

    const context: Partial<IPipelineContext> = {
      tenantId: 'tenant-omega',
      request: query,
      requestName: 'GetUserOverviewQuery',
      items,
    };

    const key = userOverviewCacheKey(context as IPipelineContext);
    expect(key).toContain('tenant-omega');
    expect(key).toContain('user\\:principal-42');
    expect(key).toContain(OVERVIEW_RESPONSE_POLICY_VERSION);
  });

  it('fails closed when tenant is missing', () => {
    const ability = buildAbility([]);
    const items = new Map<string | symbol, unknown>([
      [CASL_USER_CONTEXT_KEY, { id: 'u-1', principalType: 'user' }],
      [CASL_ABILITY_KEY, ability],
    ]);

    const context: Partial<IPipelineContext> = {
      tenantId: undefined,
      request: new GetUserOverviewQuery({ userId: 'u-123' }),
      requestName: 'GetUserOverviewQuery',
      items,
    };

    expect(() => userOverviewCacheKey(context as IPipelineContext)).toThrow(
      MissingCachePartitionError,
    );
  });

  it('fails closed when principal classification is missing', () => {
    const ability = buildAbility([]);
    const items = new Map<string | symbol, unknown>([
      [CASL_USER_CONTEXT_KEY, { id: 'u-1' }], // missing principalType
      [CASL_ABILITY_KEY, ability],
    ]);

    const context: Partial<IPipelineContext> = {
      tenantId: 'tenant-a',
      request: new GetUserOverviewQuery({ userId: 'u-123' }),
      requestName: 'GetUserOverviewQuery',
      items,
    };

    expect(() => userOverviewCacheKey(context as IPipelineContext)).toThrow(
      MissingCachePartitionError,
    );
    expect(() => userOverviewCacheKey(context as IPipelineContext)).toThrow(
      /requires a principal partition/,
    );
  });

  it('fails closed when CASL ability is absent from context', () => {
    const items = new Map<string | symbol, unknown>([
      [CASL_USER_CONTEXT_KEY, { id: 'u-1', principalType: 'user' }],
    ]);

    const context: Partial<IPipelineContext> = {
      tenantId: 'tenant-a',
      request: new GetUserOverviewQuery({ userId: 'u-123' }),
      requestName: 'GetUserOverviewQuery',
      items,
    };

    expect(() => userOverviewCacheKey(context as IPipelineContext)).toThrow(
      MissingCachePartitionError,
    );
    expect(() => userOverviewCacheKey(context as IPipelineContext)).toThrow(
      /requires a scope partition/,
    );
  });

  it('separates user and service principals that share the same identifier', () => {
    const ability = buildAbility([]);
    const userCtx: Partial<IPipelineContext> = {
      tenantId: 'tenant-a',
      request: new GetUserOverviewQuery({ userId: 'u-123' }),
      requestName: 'GetUserOverviewQuery',
      items: new Map<string | symbol, unknown>([
        [CASL_USER_CONTEXT_KEY, { id: 'actor-99', principalType: 'user' }],
        [CASL_ABILITY_KEY, ability],
      ]),
    };
    const serviceCtx: Partial<IPipelineContext> = {
      tenantId: 'tenant-a',
      request: new GetUserOverviewQuery({ userId: 'u-123' }),
      requestName: 'GetUserOverviewQuery',
      items: new Map<string | symbol, unknown>([
        [CASL_USER_CONTEXT_KEY, { id: 'actor-99', principalType: 'service' }],
        [CASL_ABILITY_KEY, ability],
      ]),
    };

    const userKey = userOverviewCacheKey(userCtx as IPipelineContext);
    const serviceKey = userOverviewCacheKey(serviceCtx as IPipelineContext);

    expect(userKey).not.toBe(serviceKey);
    expect(userKey).toContain('user\\:actor-99');
    expect(serviceKey).toContain('service\\:actor-99');
  });

  it('changes permission scope partition when additional capabilities change with same roles', () => {
    const abilityV1 = buildAbility(
      [
        {
          name: 'operator',
          capabilities: [{ subject: 'User', action: 'read' }],
        },
      ],
      undefined,
      [],
    );
    const abilityV2 = buildAbility(
      [
        {
          name: 'operator',
          capabilities: [{ subject: 'User', action: 'read' }],
        },
      ],
      undefined,
      [{ subject: 'User', action: 'read', fields: ['email'] }],
    );

    const makeCtx = (ability: unknown): IPipelineContext =>
      ({
        tenantId: 'tenant-a',
        request: new GetUserOverviewQuery({ userId: 'u-123' }),
        requestName: 'GetUserOverviewQuery',
        items: new Map<string | symbol, unknown>([
          [CASL_USER_CONTEXT_KEY, { id: 'alice', principalType: 'user' }],
          [CASL_ABILITY_KEY, ability],
        ]),
      }) as IPipelineContext;

    const keyV1 = userOverviewCacheKey(makeCtx(abilityV1));
    const keyV2 = userOverviewCacheKey(makeCtx(abilityV2));

    expect(keyV1).not.toBe(keyV2);
  });

  it('bypasses caching when ability contains entity-dependent conditions on User', () => {
    const conditionalAbility = buildAbility([
      {
        name: 'department-member',
        capabilities: [
          {
            subject: 'User',
            action: 'read',
            conditions: { department: '${user.department}' },
          },
        ],
      },
    ]);

    const context: Partial<IPipelineContext> = {
      tenantId: 'tenant-a',
      items: new Map<string | symbol, unknown>([
        [CASL_USER_CONTEXT_KEY, { id: 'alice', principalType: 'user' }],
        [CASL_ABILITY_KEY, conditionalAbility],
      ]),
    };

    expect(hasEntityDependentConditions(context as IPipelineContext)).toBe(
      true,
    );
    expect(userOverviewCacheCondition(context as IPipelineContext)).toBe(false);
  });

  it('permits caching when ability has only unconditional permissions', () => {
    const unconditionalAbility = buildAbility([
      {
        name: 'staff',
        capabilities: [{ subject: 'User', action: 'read' }],
      },
    ]);

    const context: Partial<IPipelineContext> = {
      tenantId: 'tenant-a',
      items: new Map<string | symbol, unknown>([
        [CASL_USER_CONTEXT_KEY, { id: 'alice', principalType: 'user' }],
        [CASL_ABILITY_KEY, unconditionalAbility],
      ]),
    };

    expect(hasEntityDependentConditions(context as IPipelineContext)).toBe(
      false,
    );
    expect(userOverviewCacheCondition(context as IPipelineContext)).toBe(true);
  });

  it('keeps caching when only conditional rules for other actions exist', () => {
    const ability = buildAbility([
      {
        name: 'staff',
        capabilities: [
          { subject: 'User', action: 'read' },
          {
            subject: 'User',
            action: 'update',
            conditions: { department: 'engineering' },
          },
        ],
      },
    ]);

    const context: Partial<IPipelineContext> = {
      tenantId: 'tenant-a',
      items: new Map<string | symbol, unknown>([
        [CASL_USER_CONTEXT_KEY, { id: 'alice', principalType: 'user' }],
        [CASL_ABILITY_KEY, ability],
      ]),
    };

    expect(userOverviewCacheCondition(context as IPipelineContext)).toBe(true);
  });

  it('partitions only by the principal whose ability governs the request', () => {
    const context: Partial<IPipelineContext> = {
      tenantId: 'tenant-a',
      request: new GetUserOverviewQuery({ userId: 'u-123' }),
      requestName: 'GetUserOverviewQuery',
      items: new Map<string | symbol, unknown>([
        ['user', { id: 'impostor', principalType: 'user' }],
        [CASL_USER_CONTEXT_KEY, { id: 'alice', principalType: 'user' }],
        [CASL_ABILITY_KEY, buildAbility([])],
      ]),
    };

    const key = userOverviewCacheKey(context as IPipelineContext);

    expect(key).toContain('user\\:alice');
    expect(key).not.toContain('impostor');
  });

  it('fails closed when only an unrelated context entry names a principal', () => {
    const context: Partial<IPipelineContext> = {
      tenantId: 'tenant-a',
      request: new GetUserOverviewQuery({ userId: 'u-123' }),
      requestName: 'GetUserOverviewQuery',
      items: new Map<string | symbol, unknown>([
        ['user', { id: 'alice', principalType: 'user' }],
        [CASL_ABILITY_KEY, buildAbility([])],
      ]),
    };

    expect(() => userOverviewCacheKey(context as IPipelineContext)).toThrow(
      MissingCachePartitionError,
    );
  });
});
