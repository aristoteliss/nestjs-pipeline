/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type INestApplication, Injectable } from '@nestjs/common';
import { CqrsModule, QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import {
  CacheBehavior,
  CacheModule,
  MissingCachePartitionError,
} from '@nestjs-pipeline/cache';
import {
  buildAbility,
  CASL_ABILITY_KEY,
  CASL_USER_CONTEXT_KEY,
  CaslBehavior,
  CaslModule,
  type IRoleProvider,
  type RoleDefinition,
  UnauthorizedActionException,
} from '@nestjs-pipeline/casl';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  PipelineModule,
} from '@nestjs-pipeline/core';
import type { IQueryRepository } from '@nestjs-pipeline/ddd-core/application';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GetUserCapabilitiesQuery } from '../src/auths/cqrs/queries/get-user-capabilities.query';
import type { SessionUser } from '../src/common/types/SessionUser';
import {
  GetUserOverviewHandler,
  OVERVIEW_RESPONSE_POLICY_VERSION,
  resolveOverviewScope,
  userOverviewCacheKey,
} from '../src/users/cqrs/queries/get-user-overview.handler';
import { GetUserOverviewQuery } from '../src/users/cqrs/queries/get-user-overview.query';
import { User } from '../src/users/domain/models/user.entity';
import { QUERY_REPOSITORY } from '../src/users/persistence/repository.tokens';

let currentTenant: string | undefined = 'tenant-alpha';
let currentSessionUser: SessionUser | undefined;

@Injectable()
class AmbientSessionBehavior implements IPipelineBehavior {
  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    if (currentSessionUser) {
      context.items.set('user', currentSessionUser);
      context.items.set(CASL_USER_CONTEXT_KEY, currentSessionUser);
    }
    return next();
  }
}

describe('User overview composed query security and caching contracts', () => {
  let app: INestApplication;
  let queries: QueryBus;

  let targetUser: User;
  let userFindCount: number;
  let capabilitiesFindCount: number;
  let activeRoles: RoleDefinition[];

  let mockUserRepo: IQueryRepository<GetUserOverviewQuery, User | null>;
  let mockCapabilitiesRepo: IQueryRepository<
    GetUserCapabilitiesQuery,
    { roles: string[]; additionalCapabilities: string[] }
  >;
  let mockRoleProvider: IRoleProvider;

  beforeEach(async () => {
    currentTenant = 'tenant-alpha';
    currentSessionUser = undefined;
    userFindCount = 0;
    capabilitiesFindCount = 0;

    targetUser = User.create(
      'TargetAlice',
      'alice@company.test',
      'engineering',
    );

    mockUserRepo = {
      find: async () => {
        userFindCount += 1;
        return targetUser;
      },
    };

    mockCapabilitiesRepo = {
      find: async () => {
        capabilitiesFindCount += 1;
        return {
          roles: ['member'],
          additionalCapabilities: ['report:view'],
        };
      },
    };

    activeRoles = [
      {
        name: 'admin',
        capabilities: [
          { subject: 'User', action: 'read' },
          { subject: 'Role', action: 'read' },
        ],
      },
      {
        name: 'restricted-viewer',
        capabilities: [
          {
            subject: 'User',
            action: 'read',
            fields: ['username', 'department'],
          },
        ],
      },
      {
        name: 'department-scoped',
        capabilities: [
          {
            subject: 'User',
            action: 'read',
            conditions: { department: '${user.department}' },
          },
        ],
      },
    ];

    mockRoleProvider = {
      getRoles: async (names?: string[]) => {
        if (!names || names.length === 0) return activeRoles;
        return activeRoles.filter((r) => names.includes(r.name));
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        CqrsModule.forRoot(),
        CacheModule.forRoot({
          store: { type: 'memory' },
          ttl: 60_000,
        }),
        CaslModule.forRoot({
          roleProvider: {
            useFactory: () => mockRoleProvider,
          },
        }),
        PipelineModule.forRootAsync({
          behaviors: [AmbientSessionBehavior, CaslBehavior, CacheBehavior],
          useFactory: () => ({
            tenantIdFactory: () => currentTenant,
            globalBehaviors: [
              {
                scope: 'all',
                before: [AmbientSessionBehavior],
              },
            ],
          }),
        }),
      ],
      providers: [
        GetUserOverviewHandler,
        { provide: QUERY_REPOSITORY.getUser, useValue: mockUserRepo },
        {
          provide: QUERY_REPOSITORY.getUserCapabilities,
          useValue: mockCapabilitiesRepo,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    queries = app.get(QueryBus);
  });

  afterEach(async () => {
    await app?.close();
  });

  it('serves a repeated identical request from the cache for an eligible caller', async () => {
    currentSessionUser = {
      id: 'viewer-admin',
      principalType: 'user',
      tenant: 'tenant-alpha',
      capabilities: { roles: ['admin'] },
    };

    const first = await queries.execute(
      new GetUserOverviewQuery({ userId: targetUser.id }),
    );
    const second = await queries.execute(
      new GetUserOverviewQuery({ userId: targetUser.id }),
    );

    expect(first).toEqual(second);
    expect(first).toEqual({
      id: targetUser.id,
      username: 'TargetAlice',
      email: 'alice@company.test',
      department: 'engineering',
      roles: ['member'],
      capabilities: ['report:view'],
    });
    expect(userFindCount).toBe(1);
    expect(capabilitiesFindCount).toBe(1);
  });

  it('applies field authorization so viewers with restricted fields receive only readable projections', async () => {
    currentSessionUser = {
      id: 'viewer-restricted',
      principalType: 'user',
      tenant: 'tenant-alpha',
      capabilities: { roles: ['restricted-viewer'] },
    };

    const result = await queries.execute(
      new GetUserOverviewQuery({ userId: targetUser.id }),
    );

    expect(result).toEqual({
      username: 'TargetAlice',
      department: 'engineering',
    });
    expect('id' in (result ?? {})).toBe(false);
    expect('email' in (result ?? {})).toBe(false);
    expect('roles' in (result ?? {})).toBe(false);
    expect('capabilities' in (result ?? {})).toBe(false);
    expect(userFindCount).toBe(1);
    expect(capabilitiesFindCount).toBe(0);
  });

  it('prevents a less privileged caller from reading a privileged cached response', async () => {
    // 1. Admin executes query and populates cache with email and roles
    currentSessionUser = {
      id: 'viewer-admin',
      principalType: 'user',
      tenant: 'tenant-alpha',
      capabilities: { roles: ['admin'] },
    };
    const adminResult = await queries.execute(
      new GetUserOverviewQuery({ userId: targetUser.id }),
    );
    expect(adminResult?.email).toBe('alice@company.test');
    expect(userFindCount).toBe(1);

    // 2. Restricted viewer executes query for the same target
    currentSessionUser = {
      id: 'viewer-restricted',
      principalType: 'user',
      tenant: 'tenant-alpha',
      capabilities: { roles: ['restricted-viewer'] },
    };
    const restrictedResult = await queries.execute(
      new GetUserOverviewQuery({ userId: targetUser.id }),
    );

    expect(restrictedResult?.email).toBeUndefined();
    expect('email' in (restrictedResult ?? {})).toBe(false);
    expect(userFindCount).toBe(2);
  });

  it('separates cache entries across different tenants', async () => {
    currentSessionUser = {
      id: 'viewer-admin',
      principalType: 'user',
      tenant: 'tenant-alpha',
      capabilities: { roles: ['admin'] },
    };

    await queries.execute(new GetUserOverviewQuery({ userId: targetUser.id }));
    expect(userFindCount).toBe(1);

    currentTenant = 'tenant-beta';
    currentSessionUser.tenant = 'tenant-beta';

    await queries.execute(new GetUserOverviewQuery({ userId: targetUser.id }));
    expect(userFindCount).toBe(2);
  });

  it('separates user and service principals with identical textual IDs', async () => {
    currentSessionUser = {
      id: 'shared-id',
      principalType: 'user',
      tenant: 'tenant-alpha',
      capabilities: { roles: ['admin'] },
    };

    await queries.execute(new GetUserOverviewQuery({ userId: targetUser.id }));
    expect(userFindCount).toBe(1);

    currentSessionUser = {
      id: 'shared-id',
      principalType: 'service',
      tenant: 'tenant-alpha',
      capabilities: { roles: ['admin'] },
    };

    await queries.execute(new GetUserOverviewQuery({ userId: targetUser.id }));
    expect(userFindCount).toBe(2);
  });

  it('separates distinct target query payloads', async () => {
    currentSessionUser = {
      id: 'viewer-admin',
      principalType: 'user',
      tenant: 'tenant-alpha',
      capabilities: { roles: ['admin'] },
    };

    const firstId = '018f2d5e-4b6a-7b3f-8c1d-2e3f4a5b6c01';
    const secondId = '018f2d5e-4b6a-7b3f-8c1d-2e3f4a5b6c02';

    await queries.execute(new GetUserOverviewQuery({ userId: firstId }));
    await queries.execute(new GetUserOverviewQuery({ userId: secondId }));

    expect(userFindCount).toBe(2);
  });

  it('invalidates cache reuse when additional capabilities change with same roles', async () => {
    currentSessionUser = {
      id: 'viewer-custom',
      principalType: 'user',
      tenant: 'tenant-alpha',
      capabilities: {
        roles: ['admin'],
        additionalCapabilities: ['Report|read|*'],
      },
    };

    await queries.execute(new GetUserOverviewQuery({ userId: targetUser.id }));
    expect(userFindCount).toBe(1);

    // Same roles, but different additional capabilities
    currentSessionUser = {
      id: 'viewer-custom',
      principalType: 'user',
      tenant: 'tenant-alpha',
      capabilities: {
        roles: ['admin'],
        additionalCapabilities: ['Report|export|*'],
      },
    };

    await queries.execute(new GetUserOverviewQuery({ userId: targetUser.id }));
    expect(userFindCount).toBe(2);
  });

  it('invalidates cache reuse when an explicit denial is added', async () => {
    currentSessionUser = {
      id: 'viewer-denial',
      principalType: 'user',
      tenant: 'tenant-alpha',
      capabilities: {
        roles: ['admin'],
      },
    };

    await queries.execute(new GetUserOverviewQuery({ userId: targetUser.id }));
    expect(userFindCount).toBe(1);

    // Add denial for email field
    currentSessionUser = {
      id: 'viewer-denial',
      principalType: 'user',
      tenant: 'tenant-alpha',
      capabilities: {
        roles: ['admin'],
        deniedCapabilities: [
          {
            subject: 'User',
            action: 'read',
            fields: ['email'],
            inverted: true,
          },
        ],
      },
    };

    const result = await queries.execute(
      new GetUserOverviewQuery({ userId: targetUser.id }),
    );
    expect(userFindCount).toBe(2);
    expect(result?.email).toBeUndefined();
    expect('email' in (result ?? {})).toBe(false);
  });

  it('invalidates cache reuse when a role definition is modified with same role name', async () => {
    currentSessionUser = {
      id: 'viewer-role-change',
      principalType: 'user',
      tenant: 'tenant-alpha',
      capabilities: { roles: ['analyst'] },
    };

    activeRoles.push({
      name: 'analyst',
      capabilities: [{ subject: 'User', action: 'read', fields: ['username'] }],
    });

    const first = await queries.execute(
      new GetUserOverviewQuery({ userId: targetUser.id }),
    );
    expect(first?.department).toBeUndefined();
    expect(userFindCount).toBe(1);

    // Update the definition of 'analyst' to also permit 'department'
    const roleIndex = activeRoles.findIndex((r) => r.name === 'analyst');
    activeRoles[roleIndex] = {
      name: 'analyst',
      capabilities: [
        { subject: 'User', action: 'read', fields: ['username', 'department'] },
      ],
    };

    const second = await queries.execute(
      new GetUserOverviewQuery({ userId: targetUser.id }),
    );
    expect(second?.department).toBe('engineering');
    expect(userFindCount).toBe(2);
  });

  it('bypasses caching when permissions depend on mutable target entity state', async () => {
    currentSessionUser = {
      id: 'viewer-conditional',
      principalType: 'user',
      tenant: 'tenant-alpha',
      department: 'engineering',
      capabilities: { roles: ['department-scoped'] },
    };

    // 1. Initial query: target is in engineering, matches viewer department
    const initial = await queries.execute(
      new GetUserOverviewQuery({ userId: targetUser.id }),
    );
    expect(initial?.username).toBe('TargetAlice');
    expect(userFindCount).toBe(1);

    // 2. Second query: caching must be bypassed because department rule is conditional
    await queries.execute(new GetUserOverviewQuery({ userId: targetUser.id }));
    expect(userFindCount).toBe(2);

    // 3. Target department changes to sales: immediate rejection on next query
    targetUser = User.fromJSON({
      id: targetUser.id,
      username: 'TargetAlice',
      email: 'alice@company.test',
      department: 'sales',
      createdAt: targetUser.createdAt,
      updatedAt: new Date(),
      version: 2,
    });

    await expect(
      queries.execute(new GetUserOverviewQuery({ userId: targetUser.id })),
    ).rejects.toThrow(UnauthorizedActionException);
    expect(userFindCount).toBe(3);
  });

  it('fails closed when tenant context is missing', async () => {
    currentTenant = undefined;
    currentSessionUser = {
      id: 'viewer-admin',
      principalType: 'user',
      tenant: '',
      capabilities: { roles: ['admin'] },
    };

    await expect(
      queries.execute(new GetUserOverviewQuery({ userId: targetUser.id })),
    ).rejects.toThrow(MissingCachePartitionError);
    expect(userFindCount).toBe(0);
  });

  it('fails closed when principal classification is missing', async () => {
    currentSessionUser = {
      id: 'viewer-admin',
      tenant: 'tenant-alpha',
      capabilities: { roles: ['admin'] },
    };

    await expect(
      queries.execute(new GetUserOverviewQuery({ userId: targetUser.id })),
    ).rejects.toThrow(MissingCachePartitionError);
    expect(userFindCount).toBe(0);
  });

  it('fails closed when authentication is completely absent', async () => {
    currentSessionUser = undefined;

    await expect(
      queries.execute(new GetUserOverviewQuery({ userId: targetUser.id })),
    ).rejects.toThrow(UnauthorizedActionException);
    expect(userFindCount).toBe(0);
  });

  it('enforces full loaded aggregate authorization even when cache store read throws', async () => {
    const { PIPELINE_CACHE } = await import('@nestjs-pipeline/cache');
    const cacheStore = app.get(PIPELINE_CACHE) as {
      get: (k: string) => Promise<unknown>;
    };
    vi.spyOn(cacheStore, 'get').mockRejectedValueOnce(
      new Error('Redis connection failed'),
    );

    // Viewer with restricted fields
    currentSessionUser = {
      id: 'viewer-restricted',
      principalType: 'user',
      tenant: 'tenant-alpha',
      capabilities: { roles: ['restricted-viewer'] },
    };

    const result = await queries.execute(
      new GetUserOverviewQuery({ userId: targetUser.id }),
    );

    // Handler executed and applied full field authorization despite cache failure
    expect(result?.username).toBe('TargetAlice');
    expect(result?.email).toBeUndefined();
    expect('email' in (result ?? {})).toBe(false);
    expect(userFindCount).toBe(1);
  });

  it('does not reuse response policy entries from before the repair', () => {
    const ability = buildAbility([
      { name: 'admin', capabilities: [{ subject: 'User', action: 'read' }] },
    ]);
    const ctx = {
      tenantId: 'tenant-alpha',
      request: new GetUserOverviewQuery({ userId: 'u-1' }),
      requestName: 'GetUserOverviewQuery',
      items: new Map<string | symbol, unknown>([
        ['user', { id: 'alice', principalType: 'user' }],
        [CASL_ABILITY_KEY, ability],
      ]),
    } as unknown as IPipelineContext;

    const currentKey = userOverviewCacheKey(ctx);
    expect(currentKey).toContain(OVERVIEW_RESPONSE_POLICY_VERSION);

    // An old key had roles directly in the scope without the policy version prefix
    const oldKeyPattern = /:admin:/;
    expect(oldKeyPattern.test(currentKey)).toBe(false);
  });

  it('requests authoritative aggregate loading with refresh flag set on the repository query', async () => {
    currentSessionUser = {
      id: 'viewer-admin',
      principalType: 'user',
      tenant: 'tenant-alpha',
      capabilities: { roles: ['admin'] },
    };

    let observedQuery: unknown;
    const originalFind = mockUserRepo.find;
    mockUserRepo.find = async (q: unknown) => {
      observedQuery = q;
      return originalFind(q as never);
    };

    await queries.execute(new GetUserOverviewQuery({ userId: targetUser.id }));

    expect((observedQuery as { refresh?: boolean })?.refresh).toBe(true);
  });
});

describe('Permission scope canonicalization and hashing contracts', () => {
  it('produces identical fingerprints for equivalent conditions with different key ordering', () => {
    const abilityA = buildAbility([
      {
        name: 'roleA',
        capabilities: [
          {
            subject: 'User',
            action: 'read',
            conditions: { a: 1, b: 2, c: { x: 'foo', y: 'bar' } },
          },
        ],
      },
    ]);
    const abilityB = buildAbility([
      {
        name: 'roleA',
        capabilities: [
          {
            subject: 'User',
            action: 'read',
            conditions: { c: { y: 'bar', x: 'foo' }, b: 2, a: 1 },
          },
        ],
      },
    ]);

    const ctxA = {
      items: new Map([[CASL_ABILITY_KEY, abilityA]]),
    } as unknown as IPipelineContext;
    const ctxB = {
      items: new Map([[CASL_ABILITY_KEY, abilityB]]),
    } as unknown as IPipelineContext;

    expect(resolveOverviewScope(ctxA)).toBe(resolveOverviewScope(ctxB));
  });

  it('produces distinct fingerprints when rules, actions, or fields differ', () => {
    const abilityRead = buildAbility([
      {
        name: 'roleA',
        capabilities: [{ subject: 'User', action: 'read' }],
      },
    ]);
    const abilityManage = buildAbility([
      {
        name: 'roleA',
        capabilities: [{ subject: 'User', action: 'manage' }],
      },
    ]);
    const abilityField = buildAbility([
      {
        name: 'roleA',
        capabilities: [{ subject: 'User', action: 'read', fields: ['email'] }],
      },
    ]);

    const scopeRead = resolveOverviewScope({
      items: new Map([[CASL_ABILITY_KEY, abilityRead]]),
    } as unknown as IPipelineContext);
    const scopeManage = resolveOverviewScope({
      items: new Map([[CASL_ABILITY_KEY, abilityManage]]),
    } as unknown as IPipelineContext);
    const scopeField = resolveOverviewScope({
      items: new Map([[CASL_ABILITY_KEY, abilityField]]),
    } as unknown as IPipelineContext);

    expect(scopeRead).not.toBe(scopeManage);
    expect(scopeRead).not.toBe(scopeField);
    expect(scopeManage).not.toBe(scopeField);
  });

  it('produces valid scoped fingerprints for legitimately empty capabilities', () => {
    const emptyAbility = buildAbility([]);
    const scope = resolveOverviewScope({
      items: new Map([[CASL_ABILITY_KEY, emptyAbility]]),
    } as unknown as IPipelineContext);

    expect(scope).toBeDefined();
    expect(scope).toContain(OVERVIEW_RESPONSE_POLICY_VERSION);
  });
});
