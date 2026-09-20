/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MissingCachePartitionError } from '@nestjs-pipeline/cache';
import {
  buildAbility,
  buildAbilityFromRules,
  CASL_ABILITY_KEY,
  CaslAuthorizer,
  UnauthorizedActionException,
} from '@nestjs-pipeline/casl';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import { Role } from '../../../roles/domain/models/role.entity';
import { User } from '../../domain/models/user.entity';
import {
  GetUserOverviewHandler,
  hasEntityDependentConditions,
  OVERVIEW_RESPONSE_POLICY_VERSION,
  userOverviewCacheCondition,
  userOverviewCacheKey,
} from './get-user-overview.handler';
import { GetUserOverviewQuery } from './get-user-overview.query';

describe('GetUserOverviewHandler', () => {
  it('composes user profile and capabilities into a single read model when fully authorized', async () => {
    const user = User.create('Bob', 'bob@example.test', 'engineering');
    const mockUserRepo = {
      find: vi.fn().mockResolvedValue(user),
    };
    const mockCapabilitiesRepo = {
      find: vi.fn().mockResolvedValue({
        roles: ['developer', 'operator'],
        additionalCapabilities: ['deploy:staging'],
      }),
    };
    const mockAuthorizer = {
      authorize: vi.fn().mockReturnValue({
        id: user.id,
        username: 'Bob',
        email: 'bob@example.test',
        department: 'engineering',
      }),
      can: vi.fn().mockReturnValue(true),
    };

    const handler = new GetUserOverviewHandler(
      mockUserRepo as never,
      mockCapabilitiesRepo as never,
      mockAuthorizer as unknown as CaslAuthorizer,
    );

    const query = new GetUserOverviewQuery({ userId: user.id });
    const result = await handler.execute(query);

    expect(result).toEqual({
      id: user.id,
      username: 'Bob',
      email: 'bob@example.test',
      department: 'engineering',
      roles: ['developer', 'operator'],
      capabilities: ['deploy:staging'],
    });
    expect(mockUserRepo.find).toHaveBeenCalled();
    expect(mockAuthorizer.authorize).toHaveBeenCalledWith('read', user);
    expect(mockCapabilitiesRepo.find).toHaveBeenCalled();
  });

  it('omits unauthorized fields and uses no raw aggregate fallback', async () => {
    const user = User.create('Bob', 'bob@example.test', 'engineering');
    const mockUserRepo = {
      find: vi.fn().mockResolvedValue(user),
    };
    const mockCapabilitiesRepo = {
      find: vi.fn().mockResolvedValue({
        roles: ['developer'],
        additionalCapabilities: [],
      }),
    };
    // Authorization projection strips email and department
    const mockAuthorizer = {
      authorize: vi.fn().mockReturnValue({
        id: user.id,
        username: 'Bob',
      }),
      can: vi.fn().mockReturnValue(true),
    };

    const handler = new GetUserOverviewHandler(
      mockUserRepo as never,
      mockCapabilitiesRepo as never,
      mockAuthorizer as unknown as CaslAuthorizer,
    );

    const query = new GetUserOverviewQuery({ userId: user.id });
    const result = await handler.execute(query);

    expect(result).toBeDefined();
    expect(result?.username).toBe('Bob');
    expect(result?.email).toBeUndefined();
    expect(result?.department).toBeUndefined();
    expect('email' in (result ?? {})).toBe(false);
    expect('department' in (result ?? {})).toBe(false);
  });

  it('preserves an authorized department with null value', async () => {
    const user = User.create('Bob', 'bob@example.test', null);
    const mockUserRepo = {
      find: vi.fn().mockResolvedValue(user),
    };
    const mockCapabilitiesRepo = {
      find: vi.fn().mockResolvedValue({
        roles: [],
        additionalCapabilities: [],
      }),
    };
    const mockAuthorizer = {
      authorize: vi.fn().mockReturnValue({
        id: user.id,
        username: 'Bob',
        email: 'bob@example.test',
        department: null,
      }),
      can: vi.fn().mockReturnValue(true),
    };

    const handler = new GetUserOverviewHandler(
      mockUserRepo as never,
      mockCapabilitiesRepo as never,
      mockAuthorizer as unknown as CaslAuthorizer,
    );

    const query = new GetUserOverviewQuery({ userId: user.id });
    const result = await handler.execute(query);

    expect(result?.department).toBeNull();
    expect('department' in (result ?? {})).toBe(true);
  });

  it('rejects execution and avoids downstream capabilities read when aggregate authorization fails', async () => {
    const user = User.create('Bob', 'bob@example.test', 'engineering');
    const mockUserRepo = {
      find: vi.fn().mockResolvedValue(user),
    };
    const mockCapabilitiesRepo = {
      find: vi.fn(),
    };
    const mockAuthorizer = {
      authorize: vi.fn().mockImplementation(() => {
        throw new UnauthorizedActionException({
          action: 'read',
          subject: 'User',
          reason: 'Access denied: insufficient permissions to read User.',
        });
      }),
      can: vi.fn().mockReturnValue(false),
    };

    const handler = new GetUserOverviewHandler(
      mockUserRepo as never,
      mockCapabilitiesRepo as never,
      mockAuthorizer as unknown as CaslAuthorizer,
    );

    const query = new GetUserOverviewQuery({ userId: user.id });
    await expect(handler.execute(query)).rejects.toThrow(
      UnauthorizedActionException,
    );
    expect(mockCapabilitiesRepo.find).not.toHaveBeenCalled();
  });

  it('returns null when the user does not exist and avoids downstream reads', async () => {
    const mockUserRepo = {
      find: vi.fn().mockResolvedValue(null),
    };
    const mockCapabilitiesRepo = {
      find: vi.fn(),
    };
    const mockAuthorizer = {
      authorize: vi.fn(),
      can: vi.fn(),
    };

    const handler = new GetUserOverviewHandler(
      mockUserRepo as never,
      mockCapabilitiesRepo as never,
      mockAuthorizer as unknown as CaslAuthorizer,
    );

    const missingUserId = '018f2d5e-4b6a-7b3f-8c1d-2e3f4a5b6c7d';
    const query = new GetUserOverviewQuery({ userId: missingUserId });
    const result = await handler.execute(query);

    expect(result).toBeNull();
    expect(mockAuthorizer.authorize).not.toHaveBeenCalled();
    expect(mockCapabilitiesRepo.find).not.toHaveBeenCalled();
  });

  it('omits roles and capabilities when viewer lacks permissions and skips capabilities query', async () => {
    const user = User.create('Bob', 'bob@example.test', 'engineering');
    const mockUserRepo = {
      find: vi.fn().mockResolvedValue(user),
    };
    const mockCapabilitiesRepo = {
      find: vi.fn(),
    };
    const mockAuthorizer = {
      authorize: vi.fn().mockReturnValue({
        id: user.id,
        username: 'Bob',
        email: 'bob@example.test',
      }),
      can: vi.fn().mockReturnValue(false),
    };

    const handler = new GetUserOverviewHandler(
      mockUserRepo as never,
      mockCapabilitiesRepo as never,
      mockAuthorizer as unknown as CaslAuthorizer,
    );

    const query = new GetUserOverviewQuery({ userId: user.id });
    const result = await handler.execute(query);

    expect(result?.roles).toBeUndefined();
    expect(result?.capabilities).toBeUndefined();
    expect(mockCapabilitiesRepo.find).not.toHaveBeenCalled();
  });

  it('allows roles but omits capabilities when only role inspection is authorized', async () => {
    const user = User.create('Bob', 'bob@example.test', 'engineering');
    const mockUserRepo = {
      find: vi.fn().mockResolvedValue(user),
    };
    const mockCapabilitiesRepo = {
      find: vi.fn().mockResolvedValue({
        roles: ['developer'],
        additionalCapabilities: ['sensitive:deploy'],
      }),
    };
    const mockAuthorizer = {
      authorize: vi.fn().mockReturnValue({
        id: user.id,
        username: 'Bob',
      }),
      can: vi.fn().mockImplementation((_action, subject, field) => {
        if (subject === 'Role') return true;
        if (field === 'roles') return true;
        if (field === 'capabilities') return false;
        return false;
      }),
    };

    const handler = new GetUserOverviewHandler(
      mockUserRepo as never,
      mockCapabilitiesRepo as never,
      mockAuthorizer as unknown as CaslAuthorizer,
    );

    const query = new GetUserOverviewQuery({ userId: user.id });
    const result = await handler.execute(query);

    expect(result?.roles).toEqual(['developer']);
    expect(result?.capabilities).toBeUndefined();
    expect(mockCapabilitiesRepo.find).toHaveBeenCalled();
  });

  it('requests authoritative aggregate loading with refresh flag set on the query', async () => {
    const user = User.create('Bob', 'bob@example.test', 'engineering');
    let capturedQuery: unknown;
    const mockUserRepo = {
      find: vi.fn().mockImplementation((q) => {
        capturedQuery = q;
        return Promise.resolve(user);
      }),
    };
    const mockCapabilitiesRepo = {
      find: vi
        .fn()
        .mockResolvedValue({ roles: [], additionalCapabilities: [] }),
    };
    const mockAuthorizer = {
      authorize: vi.fn().mockReturnValue({ id: user.id, username: 'Bob' }),
      can: vi.fn().mockReturnValue(true),
    };

    const handler = new GetUserOverviewHandler(
      mockUserRepo as never,
      mockCapabilitiesRepo as never,
      mockAuthorizer as unknown as CaslAuthorizer,
    );

    await handler.execute(new GetUserOverviewQuery({ userId: user.id }));
    expect((capturedQuery as { refresh?: boolean })?.refresh).toBe(true);
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
      undefined,
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
        'user',
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
      ['user', { id: 'u-1', principalType: 'user' }],
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
      ['user', { id: 'u-1' }], // missing principalType
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
      ['user', { id: 'u-1', principalType: 'user' }],
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
        ['user', { id: 'actor-99', principalType: 'user' }],
        [CASL_ABILITY_KEY, ability],
      ]),
    };
    const serviceCtx: Partial<IPipelineContext> = {
      tenantId: 'tenant-a',
      request: new GetUserOverviewQuery({ userId: 'u-123' }),
      requestName: 'GetUserOverviewQuery',
      items: new Map<string | symbol, unknown>([
        ['user', { id: 'actor-99', principalType: 'service' }],
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
          ['user', { id: 'alice', principalType: 'user' }],
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
        ['user', { id: 'alice', principalType: 'user' }],
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
        ['user', { id: 'alice', principalType: 'user' }],
        [CASL_ABILITY_KEY, unconditionalAbility],
      ]),
    };

    expect(hasEntityDependentConditions(context as IPipelineContext)).toBe(
      false,
    );
    expect(userOverviewCacheCondition(context as IPipelineContext)).toBe(true);
  });
});
