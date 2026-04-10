/**
 * Integration tests for CaslBehavior.handle() — the full pipeline path.
 *
 * Test roles mirror demo-roles.yml (admin, viewer, author, project-manager,
 * auditor, support-agent) to validate real-world capability patterns.
 */
/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: false positive */

import { createMongoAbility } from '@casl/ability';
import type { Type } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import type { CaslBehaviorOptions } from './casl.behavior';
import { CaslBehavior } from './casl.behavior';
import { CASL_ABILITY_KEY, CASL_USER_CONTEXT_KEY } from './constants/tokens';
import type {
  IRoleProvider,
  IUserCapabilityProvider,
  IUserContextResolver,
} from './interfaces/providers.interface';
import type {
  AppAbility,
  CaslUserContext,
  RoleDefinition,
  UserCapabilities,
} from './types/casl.types';

// ── Roles from demo-roles.yml ───────────────────────────────────────────

const adminRole: RoleDefinition = {
  name: 'admin',
  capabilities: ['all|manage|*'],
};

const viewerRole: RoleDefinition = {
  name: 'viewer',
  capabilities: ['Post|read|*', 'Comment|read|*'],
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

const projectManagerRole: RoleDefinition = {
  name: 'project-manager',
  capabilities: [
    'Project|read|{"tenantId":"${tenantId}"}',
    'Project|update|{"tenantId":"${tenantId}","members":{"$elemMatch":{"userId":"${id}"}},"status":{"$in":["active","planning"]}}',
    'Task|manage|{"tenantId":"${tenantId}","assigneeId":"${id}"}',
    'Task|read|{"tenantId":"${tenantId}"}',
    'Comment|read|{"tenantId":"${tenantId}"}',
    'Comment|create|*',
    'Comment|delete|{"authorId":"${id}","status":"draft"}',
  ],
};

const auditorRole: RoleDefinition = {
  name: 'auditor',
  capabilities: [
    {
      subject: 'User',
      action: 'read',
      conditions: { tenantId: '${tenantId}' },
      fields: ['id', 'name', 'email', 'role'],
    },
    'Project|read|{"tenantId":"${tenantId}"}',
    'Invoice|read|{"tenantId":"${tenantId}"}',
    'AuditLog|read|{"tenantId":"${tenantId}"}',
    {
      subject: 'User',
      action: 'update',
      inverted: true,
      reason: 'Auditors have read-only access',
    },
  ],
};

const supportAgentRole: RoleDefinition = {
  name: 'support-agent',
  capabilities: [
    'Ticket|read|{"department":"${department}"}',
    'Ticket|update|{"department":"${department}"}|status,assigneeId',
    'User|read|*|id,name,email',
    'Note|create|*',
    'Note|read|{"department":"${department}"}',
    '!Ticket|delete|*',
  ],
};

const allRoles = [
  adminRole,
  viewerRole,
  authorRole,
  projectManagerRole,
  auditorRole,
  supportAgentRole,
];

// ── Test helpers ────────────────────────────────────────────────────────

function makeRoleProvider(roles: RoleDefinition[]): IRoleProvider {
  const map = new Map(roles.map((r) => [r.name, r]));
  return {
    getRoles: (names?: string[]) =>
      names ? names.filter((n) => map.has(n)).map((n) => map.get(n)!) : roles,
  };
}

function makeUserCapabilityProvider(
  rolesMap: Record<string, string[]>,
  additional?: Record<string, UserCapabilities['additionalCapabilities']>,
  denied?: Record<string, UserCapabilities['deniedCapabilities']>,
): IUserCapabilityProvider {
  return {
    getUserCapabilities: (user: CaslUserContext): UserCapabilities => {
      const userId = String(user.id);
      return {
        roles: rolesMap[userId] ?? [],
        additionalCapabilities: additional?.[userId],
        deniedCapabilities: denied?.[userId],
      };
    },
  };
}

function makeContext<T>(
  requestClass: Type<T>,
  request: T,
  user?: CaslUserContext,
  behaviorOptions?: CaslBehaviorOptions,
): IPipelineContext<T> {
  const items = new Map<string, unknown>();
  if (user) {
    items.set(CASL_USER_CONTEXT_KEY, user);
  }

  return {
    correlationId: 'test-correlation-id',
    originalCorrelationId: 'test-correlation-id',
    request,
    requestType: requestClass,
    requestName: requestClass.name,
    handlerType: class Handler {},
    handlerName: 'TestHandler',
    requestKind: 'command',
    startedAt: new Date(),
    response: undefined,
    items,
    getBehaviorOptions: <O>(_type: Type): O | undefined =>
      behaviorOptions as O | undefined,
  };
}

const nextDelegate = () => Promise.resolve('handler-result');

function createBehavior(
  roles: RoleDefinition[],
  userCapProvider?: IUserCapabilityProvider,
  contextResolver?: IUserContextResolver,
): CaslBehavior {
  return new (
    CaslBehavior as unknown as new (
      ...args: unknown[]
    ) => CaslBehavior
  )(
    makeRoleProvider(roles),
    contextResolver,
    userCapProvider,
    undefined, // logger
  );
}

// ── Test request classes ────────────────────────────────────────────────

class GetPostQuery {
  constructor(public readonly postId: string) {}
}

class CreatePostCommand {
  constructor(
    public readonly title: string,
    public readonly authorId: string,
  ) {}
}

class UpdatePostCommand {
  constructor(
    public readonly postId: string,
    public readonly authorId: string,
    public readonly title: string,
  ) {}
}

class DeleteCommentCommand {
  constructor(
    public readonly commentId: string,
    public readonly authorId: string,
    public readonly status: string,
  ) {}
}

class UpdateProjectCommand {
  constructor(
    public readonly projectId: string,
    public readonly tenantId: string,
    public readonly status: string,
    public readonly members: Array<{ userId: string }>,
    public readonly name: string,
  ) {}
}

class FulfillOrderCommand {
  constructor(
    public readonly orderId: string,
    public readonly assigneeId: string,
    public readonly status: string,
  ) {}
}

class PurgeCommand {}

class NoRequirementsQuery {
  constructor(public readonly page: number) {}
}

class GetTicketsQuery {
  constructor(public readonly department: string) {}
}

class GetProjectWithTasksQuery {
  constructor(
    public readonly projectId: string,
    public readonly tenantId: string,
  ) {}
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('CaslBehavior.handle() integration', () => {
  const userCapProvider = makeUserCapabilityProvider({
    'admin-1': ['admin'],
    'viewer-1': ['viewer'],
    'author-1': ['author'],
    'pm-1': ['project-manager'],
    'auditor-1': ['auditor'],
    'support-1': ['support-agent'],
  });

  describe('pass-through (no rules)', () => {
    it('should call next without checking when no requirements', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const ctx = makeContext(NoRequirementsQuery, new NoRequirementsQuery(1));
      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
      expect(ctx.items.has(CASL_ABILITY_KEY)).toBe(false);
    });
  });

  describe('authentication required', () => {
    it('should throw ForbiddenException when no user context', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const ctx = makeContext(GetPostQuery, new GetPostQuery('1'), undefined, {
        rules: [{ action: 'read', subject: 'Post' }],
      });
      // No user set in items
      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        'Access denied — authentication required',
      );
    });
  });

  describe('no IUserCapabilityProvider', () => {
    it('should throw Error when capability provider is missing', async () => {
      const behavior = createBehavior(allRoles); // no cap provider
      const ctx = makeContext(
        GetPostQuery,
        new GetPostQuery('1'),
        {
          id: 'viewer-1',
        },
        {
          rules: [{ action: 'read', subject: 'Post' }],
        },
      );

      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        'No IUserCapabilityProvider registered',
      );
    });
  });

  describe('admin role (all|manage|*)', () => {
    it('should allow admin to do anything', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const ctx = makeContext(
        PurgeCommand,
        new PurgeCommand(),
        {
          id: 'admin-1',
        },
        {
          rules: [{ action: 'manage', subject: 'all' }],
        },
      );

      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
    });

    it('should store ability in context.items', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const ctx = makeContext(
        GetPostQuery,
        new GetPostQuery('1'),
        {
          id: 'admin-1',
        },
        {
          rules: [{ action: 'read', subject: 'Post' }],
        },
      );

      await behavior.handle(ctx, nextDelegate);
      const ability = ctx.items.get(CASL_ABILITY_KEY) as AppAbility;
      expect(ability).toBeDefined();
      expect(ability.can('manage', 'all')).toBe(true);
    });
  });

  describe('viewer role — type-level checks', () => {
    it('should allow viewer to read posts', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const ctx = makeContext(
        GetPostQuery,
        new GetPostQuery('1'),
        {
          id: 'viewer-1',
        },
        {
          rules: [{ action: 'read', subject: 'Post' }],
        },
      );

      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
    });

    it('should deny viewer from creating posts', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const ctx = makeContext(
        CreatePostCommand,
        new CreatePostCommand('title', 'viewer-1'),
        { id: 'viewer-1' },
        { rules: [{ action: 'create', subject: 'Post' }] },
      );

      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        'Access denied — insufficient permissions',
      );
    });
  });

  describe('author role — instance-level with subjectFromRequest', () => {
    it('should allow author to update own post', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const command = new UpdatePostCommand('post-1', 'author-1', 'New Title');
      const ctx = makeContext(
        UpdatePostCommand,
        command,
        { id: 'author-1' },
        {
          subjectFromRequest: 'Post',
          rules: [{ action: 'update', subject: 'Post' }],
        },
      );

      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
    });

    it('should deny author from updating another users post', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const command = new UpdatePostCommand('post-1', 'other-user', 'Hack');
      const ctx = makeContext(
        UpdatePostCommand,
        command,
        { id: 'author-1' },
        {
          subjectFromRequest: 'Post',
          rules: [{ action: 'update', subject: 'Post' }],
        },
      );

      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('project-manager — multi-tenant complex conditions', () => {
    const pmUser: CaslUserContext = { id: 'pm-1', tenantId: 't1' };

    it('should allow PM to update project they belong to with valid status', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const command = new UpdateProjectCommand(
        'proj-1',
        't1',
        'active',
        [{ userId: 'pm-1' }],
        'Renamed',
      );
      const ctx = makeContext(UpdateProjectCommand, command, pmUser, {
        subjectFromRequest: 'Project',
        rules: [{ action: 'update', subject: 'Project' }],
      });

      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
    });

    it('should deny PM updating project in wrong tenant', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const command = new UpdateProjectCommand(
        'proj-2',
        'other-tenant',
        'active',
        [{ userId: 'pm-1' }],
        'Hack',
      );
      const ctx = makeContext(UpdateProjectCommand, command, pmUser, {
        subjectFromRequest: 'Project',
        rules: [{ action: 'update', subject: 'Project' }],
      });

      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should deny PM updating project with completed status', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const command = new UpdateProjectCommand(
        'proj-1',
        't1',
        'completed',
        [{ userId: 'pm-1' }],
        'Nope',
      );
      const ctx = makeContext(UpdateProjectCommand, command, pmUser, {
        subjectFromRequest: 'Project',
        rules: [{ action: 'update', subject: 'Project' }],
      });

      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('skipCheck option', () => {
    it('should build ability but not enforce requirements', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      // Viewer cannot manage all, but skipCheck lets it through
      const ctx = makeContext(
        PurgeCommand,
        new PurgeCommand(),
        { id: 'viewer-1' },
        { skipCheck: true, rules: [{ action: 'manage', subject: 'all' }] },
      );

      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
      const ability = ctx.items.get(CASL_ABILITY_KEY) as AppAbility;
      expect(ability).toBeDefined();
      expect(ability.can('manage', 'all')).toBe(false);
    });
  });

  describe('prebuiltAbility option', () => {
    it('should use prebuilt ability instead of resolving from providers', async () => {
      const prebuilt = createMongoAbility<[string, string]>([
        { action: 'read', subject: 'Post' },
      ]);
      // No user capability provider — prebuiltAbility bypasses resolvers
      const behavior = createBehavior(allRoles);
      const ctx = makeContext(
        GetPostQuery,
        new GetPostQuery('1'),
        { id: 'any-user' },
        {
          prebuiltAbility: prebuilt,
          rules: [{ action: 'read', subject: 'Post' }],
        },
      );

      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
      expect(ctx.items.get(CASL_ABILITY_KEY)).toBe(prebuilt);
    });

    it('should reject when prebuilt ability lacks required permission', async () => {
      const prebuilt = createMongoAbility<[string, string]>([
        { action: 'read', subject: 'Comment' },
      ]);
      const behavior = createBehavior(allRoles);
      const ctx = makeContext(
        GetPostQuery,
        new GetPostQuery('1'),
        { id: 'any-user' },
        {
          prebuiltAbility: prebuilt,
          rules: [{ action: 'read', subject: 'Post' }],
        },
      );

      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('subjectFromRequest as string[] (P9)', () => {
    it('should check instance-level conditions on multiple subjects', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const pmUser: CaslUserContext = { id: 'pm-1', tenantId: 't1' };

      // PM has Task|read|{"tenantId":"${user.tenantId}"} and
      // Project|read|{"tenantId":"${user.tenantId}"}
      const query = { projectId: 'p1', tenantId: 't1' };
      const ctx = makeContext(
        GetProjectWithTasksQuery,
        Object.assign(new GetProjectWithTasksQuery('p1', 't1'), query),
        pmUser,
        {
          subjectFromRequest: ['Project', 'Task'],
          rules: [
            { action: 'read', subject: 'Project' },
            { action: 'read', subject: 'Task' },
          ],
        },
      );

      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
    });

    it('should deny on wrong tenant for multi-subject instance check', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const pmUser: CaslUserContext = { id: 'pm-1', tenantId: 't1' };

      const query = new GetProjectWithTasksQuery('p1', 'wrong-tenant');
      const ctx = makeContext(GetProjectWithTasksQuery, query, pmUser, {
        subjectFromRequest: ['Project', 'Task'],
        rules: [
          { action: 'read', subject: 'Project' },
          { action: 'read', subject: 'Task' },
        ],
      });

      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('IUserContextResolver (async)', () => {
    it('should resolve user from async resolver', async () => {
      const asyncResolver: IUserContextResolver = {
        resolve: async (_items) => {
          // Simulating an async DB lookup
          return Promise.resolve({ id: 'admin-1' });
        },
      };

      const behavior = createBehavior(allRoles, userCapProvider, asyncResolver);
      const ctx = makeContext(
        GetPostQuery,
        new GetPostQuery('1'),
        // No user set in items — resolver provides it
        undefined,
        { rules: [{ action: 'read', subject: 'Post' }] },
      );

      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
    });

    it('should return undefined from async resolver for unauthenticated', async () => {
      const asyncResolver: IUserContextResolver = {
        resolve: async () => Promise.resolve(undefined),
      };

      const behavior = createBehavior(allRoles, userCapProvider, asyncResolver);
      const ctx = makeContext(GetPostQuery, new GetPostQuery('1'), undefined, {
        rules: [{ action: 'read', subject: 'Post' }],
      });

      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        'Access denied — authentication required',
      );
    });
  });

  describe('per-user overrides (additional + denied)', () => {
    it('should grant additional capability beyond role', async () => {
      const capProvider = makeUserCapabilityProvider(
        { 'viewer-plus': ['viewer'] },
        { 'viewer-plus': ['Post|create|*'] }, // viewer + create Post
      );

      const behavior = createBehavior(allRoles, capProvider);
      const ctx = makeContext(
        CreatePostCommand,
        new CreatePostCommand('My Post', 'viewer-plus'),
        { id: 'viewer-plus' },
        { rules: [{ action: 'create', subject: 'Post' }] },
      );

      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
    });

    it('should deny capability overridden per-user', async () => {
      const capProvider = makeUserCapabilityProvider(
        { 'author-limited': ['author'] },
        undefined,
        {
          'author-limited': [
            {
              subject: 'Post',
              action: 'delete',
              inverted: true,
              reason: 'Revoked',
            },
          ],
        },
      );

      const behavior = createBehavior(allRoles, capProvider);
      const command = new UpdatePostCommand('post-1', 'author-limited', 'Ok');
      const ctx = makeContext(
        UpdatePostCommand,
        command,
        { id: 'author-limited' },
        {
          subjectFromRequest: 'Post',
          rules: [{ action: 'update', subject: 'Post' }],
        },
      );

      // Update should still work (own post)
      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
    });
  });

  describe('support-agent — field-restricted capabilities', () => {
    it('should allow support agent to read tickets in own department', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const ctx = makeContext(
        GetTicketsQuery,
        new GetTicketsQuery('support'),
        { id: 'support-1', department: 'support' },
        {
          subjectFromRequest: 'Ticket',
          rules: [{ action: 'read', subject: 'Ticket' }],
        },
      );

      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
    });

    it('should deny support agent reading tickets from other department', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const ctx = makeContext(
        GetTicketsQuery,
        new GetTicketsQuery('engineering'),
        { id: 'support-1', department: 'support' },
        {
          subjectFromRequest: 'Ticket',
          rules: [{ action: 'read', subject: 'Ticket' }],
        },
      );

      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('project-manager — ownership delete with conditions', () => {
    const pmUser: CaslUserContext = { id: 'pm-1', tenantId: 't1' };

    it('should allow PM to delete own draft comment', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const command = new DeleteCommentCommand('c1', 'pm-1', 'draft');
      const ctx = makeContext(DeleteCommentCommand, command, pmUser, {
        subjectFromRequest: 'Comment',
        rules: [{ action: 'delete', subject: 'Comment' }],
      });

      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
    });

    it('should deny PM deleting another users comment', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const command = new DeleteCommentCommand('c2', 'other-user', 'draft');
      const ctx = makeContext(DeleteCommentCommand, command, pmUser, {
        subjectFromRequest: 'Comment',
        rules: [{ action: 'delete', subject: 'Comment' }],
      });

      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should deny PM deleting own published comment', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const command = new DeleteCommentCommand('c3', 'pm-1', 'published');
      const ctx = makeContext(DeleteCommentCommand, command, pmUser, {
        subjectFromRequest: 'Comment',
        rules: [{ action: 'delete', subject: 'Comment' }],
      });

      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('multi-requirement with field check (FulfillOrderCommand)', () => {
    const fulfillRole: RoleDefinition = {
      name: 'order-fulfiller',
      capabilities: [
        'Order|update|{"assigneeId":"${id}"}|status',
        'AuditLog|create|*',
      ],
    };
    const roles = [fulfillRole];

    const capProvider = makeUserCapabilityProvider({
      'fulfiller-1': ['order-fulfiller'],
    });

    it('should allow when user has both update Order.status and create AuditLog', async () => {
      const behavior = createBehavior(roles, capProvider);
      const command = new FulfillOrderCommand('o1', 'fulfiller-1', 'shipped');
      const ctx = makeContext(
        FulfillOrderCommand,
        command,
        { id: 'fulfiller-1' },
        {
          subjectFromRequest: 'Order',
          rules: [
            { action: 'update', subject: 'Order', field: 'status' },
            { action: 'create', subject: 'AuditLog' },
          ],
        },
      );

      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
    });

    it('should deny when user lacks create AuditLog', async () => {
      const partialRole: RoleDefinition = {
        name: 'order-only',
        capabilities: ['Order|update|{"assigneeId":"${id}"}|status'],
      };
      const partialCap = makeUserCapabilityProvider({
        'order-only-1': ['order-only'],
      });
      const behavior = createBehavior([partialRole], partialCap);
      const command = new FulfillOrderCommand('o1', 'order-only-1', 'shipped');
      const ctx = makeContext(
        FulfillOrderCommand,
        command,
        { id: 'order-only-1' },
        {
          subjectFromRequest: 'Order',
          rules: [
            { action: 'update', subject: 'Order', field: 'status' },
            { action: 'create', subject: 'AuditLog' },
          ],
        },
      );

      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should deny when assigneeId does not match user', async () => {
      const behavior = createBehavior(roles, capProvider);
      const command = new FulfillOrderCommand('o1', 'someone-else', 'shipped');
      const ctx = makeContext(
        FulfillOrderCommand,
        command,
        { id: 'fulfiller-1' },
        {
          subjectFromRequest: 'Order',
          rules: [
            { action: 'update', subject: 'Order', field: 'status' },
            { action: 'create', subject: 'AuditLog' },
          ],
        },
      );

      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('options.rules — inline requirements', () => {
    const userCapProvider = makeUserCapabilityProvider({
      'admin-1': ['admin'],
      'viewer-1': ['viewer'],
      'author-1': ['author'],
    });

    it('should enforce inline rules on a class with no rules', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      // NoRequirementsQuery has no rules, but we pass rules via options
      const ctx = makeContext(
        NoRequirementsQuery,
        new NoRequirementsQuery(1),
        { id: 'viewer-1' },
        { rules: [{ action: 'create', subject: 'Post' }] },
      );

      // Viewer cannot create posts
      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow when inline rules are satisfied', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const ctx = makeContext(
        NoRequirementsQuery,
        new NoRequirementsQuery(1),
        { id: 'viewer-1' },
        { rules: [{ action: 'read', subject: 'Post' }] },
      );

      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
    });

    it('should check stricter rules than the handler might need', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      // Pass a stricter requirement than what the viewer can do
      const ctx = makeContext(
        GetPostQuery,
        new GetPostQuery('1'),
        { id: 'viewer-1' },
        { rules: [{ action: 'create', subject: 'Post' }] },
      );

      // Viewer can read Post but NOT create
      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should support multi-requirement inline rules with subjectFromRequest', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const command = new UpdatePostCommand('post-1', 'author-1', 'New Title');
      const ctx = makeContext(
        UpdatePostCommand,
        command,
        { id: 'author-1' },
        {
          subjectFromRequest: 'Post',
          rules: [
            { action: 'update', subject: 'Post' },
            { action: 'read', subject: 'Comment' },
          ],
        },
      );

      // Author can update own post AND read comments
      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
    });

    it('should deny multi-requirement inline rules when one fails', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const command = new UpdatePostCommand('post-1', 'author-1', 'New Title');
      const ctx = makeContext(
        UpdatePostCommand,
        command,
        { id: 'author-1' },
        {
          subjectFromRequest: 'Post',
          rules: [
            { action: 'update', subject: 'Post' },
            { action: 'manage', subject: 'all' }, // author cannot manage all
          ],
        },
      );

      await expect(behavior.handle(ctx, nextDelegate)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should pass through with empty rules array', async () => {
      const behavior = createBehavior(allRoles, userCapProvider);
      const ctx = makeContext(
        NoRequirementsQuery,
        new NoRequirementsQuery(1),
        { id: 'viewer-1' },
        { rules: [] },
      );

      // Empty rules = pass through (no checks)
      const result = await behavior.handle(ctx, nextDelegate);
      expect(result).toBe('handler-result');
    });
  });
});
