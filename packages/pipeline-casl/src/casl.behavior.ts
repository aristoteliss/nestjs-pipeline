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

import { subject as caslSubject, ForbiddenError } from '@casl/ability';
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  LoggerService,
  Optional,
} from '@nestjs/common';
import {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@nestjs-pipeline/core';
import {
  CASL_ABILITY_KEY,
  CASL_BEHAVIOR_LOGGER,
  CASL_ROLE_PROVIDER,
  CASL_USER_CAPABILITY_PROVIDER,
  CASL_USER_CONTEXT_KEY,
  CASL_USER_CONTEXT_RESOLVER,
} from './constants/tokens';
import type {
  IRoleProvider,
  IUserCapabilityProvider,
  IUserContextResolver,
} from './interfaces/providers.interface';
import { buildAbility } from './services/ability.factory';
import type {
  AbilityRequirement,
  AppAbility,
  Capability,
  CapabilityString,
  CaslUserContext,
} from './types/casl.types';

/**
 * Per-handler options for the CASL behavior, passed via `@UsePipeline([CaslBehavior, opts])`.
 */
export interface CaslBehaviorOptions {
  /**
   * Override the subject type used when checking permissions against the
   * request object instance. If not set, only type-level checks are performed
   * (no instance-level condition matching).
   *
   * Set this when you want CASL to evaluate conditions against the request payload.
   * The command/query properties are matched against the capability's `conditions`.
   *
   * @example Update own posts — conditions check `authorId` on the command
   * ```ts
   * // Capability: Post|update|{"authorId":"${user.id}"}
   * // The command payload { authorId: 'abc' } is matched against the resolved condition
   * @CommandHandler(UpdatePostCommand)
   * @UsePipeline([CaslBehavior, {
   *   subjectFromRequest: 'Post',
   *   rules: [{ action: 'update', subject: 'Post' }],
   * }])
   * class UpdatePostHandler { ... }
   * ```
   *
   * @example Multi-tenant — conditions check `tenantId` on the command
   * ```ts
   * // Capability: Project|update|{"tenantId":"${user.tenantId}","status":{"$in":["active","planning"]}}
   * @CommandHandler(UpdateProjectCommand)
   * @UsePipeline([CaslBehavior, {
   *   subjectFromRequest: 'Project',
   *   rules: [{ action: 'update', subject: 'Project' }],
   * }])
   * class UpdateProjectHandler { ... }
   * ```
   *
   * @example Delete with ownership — only delete own draft comments
   * ```ts
   * // Capability: Comment|delete|{"authorId":"${user.id}","status":"draft"}
   * @CommandHandler(DeleteCommentCommand)
   * @UsePipeline([CaslBehavior, {
   *   subjectFromRequest: 'Comment',
   *   rules: [{ action: 'delete', subject: 'Comment' }],
   * }])
   * class DeleteCommentHandler { ... }
   * ```
   *
   * @example Multiple subjects — instance-level checks on several types at once
   * ```ts
   * // When a single command touches multiple subject types, pass an array.
   * // Each requirement whose subject is in the array gets an instance-level
   * // condition check against the request payload.
   * @CommandHandler(ReplanProjectCommand)
   * @UsePipeline([CaslBehavior, {
   *   subjectFromRequest: ['Project', 'Task'],
   *   rules: [
   *     { action: 'update', subject: 'Project' },
   *     { action: 'manage', subject: 'Task' },
   *   ],
   * }])
   * class ReplanProjectHandler { ... }
   * ```
   */
  subjectFromRequest?: string | string[];

  /**
   * When true, the behavior skips authorization checks for this handler
   * but still builds and stores the ability in `context.items`.
   *
   * Useful for public endpoints that need the ability instance for
   * conditional UI or downstream logic, without blocking access.
   *
   * @example Public listing with conditional fields
   * ```ts
   * // Anyone can list posts, but the handler checks ability to decide
   * // whether to include draft posts or restricted fields.
   *
   * @QueryHandler(ListPostsQuery)
   * @UsePipeline([CaslBehavior, { skipCheck: true }])
   * class ListPostsHandler implements IQueryHandler<ListPostsQuery> {
   *   async execute(query: ListPostsQuery, context: IPipelineContext) {
   *     const ability = context.items.get(CASL_ABILITY_KEY) as AppAbility;
   *     const includeDrafts = ability?.can('read', 'DraftPost');
   *     // ... fetch posts accordingly
   *   }
   * }
   * ```
   */
  skipCheck?: boolean;

  /**
   * Provide pre-built raw rules directly instead of resolving from providers.
   * Useful for testing or when the ability is pre-computed.
   *
   * @example Testing a handler with a specific ability
   * ```ts
   * const testAbility = createMongoAbility<[string, string]>([
   *   { action: 'read', subject: 'Post' },
   *   { action: 'update', subject: 'Post', conditions: { authorId: 'user-1' } },
   * ]);
   *
   * @UsePipeline([CaslBehavior, { prebuiltAbility: testAbility }])
   * ```
   */
  prebuiltAbility?: AppAbility;

  /**
   * Inline permission requirements checked by the behavior.
   *
   * All requirements must pass (AND logic). If any fails, a
   * `ForbiddenException` is thrown.
   *
   * @example Single requirement
   * ```ts
   * @CommandHandler(CreatePostCommand)
   * @UsePipeline([CaslBehavior, {
   *   rules: [{ action: 'create', subject: 'Post' }],
   * }])
   * class CreatePostHandler { ... }
   * ```
   *
   * @example Multi-requirement with instance-level check
   * ```ts
   * @CommandHandler(CreateRoleCommand)
   * @UsePipeline([CaslBehavior, {
   *   subjectFromRequest: 'Role',
   *   rules: [
   *     { action: 'create', subject: 'Role' },
   *     { action: 'read', subject: 'User' },
   *   ],
   * }])
   * class CreateRoleHandler { ... }
   * ```
   */
  rules?: AbilityRequirement[];
}

/**
 * Pipeline behavior that enforces CASL-based authorization (ABAC with roles).
 *
 * **How it works:**
 * 1. Resolves the current user context (via {@link IUserContextResolver} or items bag)
 * 2. Loads role definitions from {@link IRoleProvider}
 * 3. Optionally loads per-user overrides from {@link IUserCapabilityProvider}
 * 4. Builds a CASL `MongoAbility` instance
 * 5. Reads `rules` from {@link CaslBehaviorOptions}
 * 6. Checks each requirement against the ability — throws `ForbiddenException` on failure
 * 7. Stores the ability in `context.items` under {@link CASL_ABILITY_KEY} for downstream use
 *
 * **Registration — globally:**
 * ```ts
 * PipelineModule.forRoot({
 *   globalBehaviors: {
 *     scope: 'all',
 *     before: [CaslBehavior],
 *   },
 * })
 * ```
 *
 * **Registration — per handler:**
 * ```ts
 * @UsePipeline([CaslBehavior, {
 *   subjectFromRequest: 'Post',
 *   rules: [{ action: 'update', subject: 'Post' }],
 * }])
 * ```
 *
 * @example End-to-end with PostgreSQL-backed providers
 * ```ts
 * // ── 1. Schema (see Capability JSDoc for full column/junction layout) ────
 * // capabilities                 (id, subject, action, conditions, inverted, reason, fields)
 * // roles                        (id, name)
 * // role_capabilities            (role_id, capability_id)
 * // user_roles                   (user_id, role_id)
 * // user_additional_capabilities (user_id, capability_id)
 * // user_denied_capabilities     (user_id, capability_id)
 *
 * // ── 2. Providers ─────────────────────────────────────────────────────────
 * @Injectable()
 * class PgRoleProvider implements IRoleProvider {
 *   constructor(private readonly pool: Pool) {}
 *
 *   async getRoles(names?: string[]): Promise<RoleDefinition[]> {
 *     const where = names ? 'WHERE r.name = ANY($1)' : '';
 *     const params = names ? [names] : [];
 *     const { rows } = await this.pool.query(
 *       `SELECT r.name,
 *               json_agg(json_build_object(
 *                 'subject', c.subject, 'action', c.action,
 *                 'conditions', c.conditions, 'inverted', c.inverted,
 *                 'reason', c.reason, 'fields', c.fields
 *               )) AS capabilities
 *        FROM roles r
 *        JOIN role_capabilities rc ON rc.role_id = r.id
 *        JOIN capabilities c ON c.id = rc.capability_id
 *        ${where}
 *        GROUP BY r.id`,
 *       params,
 *     );
 *     return rows;
 *   }
 * }
 *
 * @Injectable()
 * class PgUserCapabilityProvider implements IUserCapabilityProvider {
 *   constructor(private readonly pool: Pool) {}
 *
 *   async getUserCapabilities(user: CaslUserContext): Promise<UserCapabilities> {
 *     const rolesResult = await this.pool.query(
 *       'SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1',
 *       [user.id],
 *     );
 *
 *     const additionalResult = await this.pool.query(
 *       `SELECT c.subject, c.action, c.conditions, c.inverted, c.reason, c.fields
 *        FROM user_additional_capabilities uac
 *        JOIN capabilities c ON c.id = uac.capability_id
 *        WHERE uac.user_id = $1`,
 *       [user.id],
 *     );
 *
 *     const deniedResult = await this.pool.query(
 *       `SELECT c.subject, c.action, c.conditions, c.inverted, c.reason, c.fields
 *        FROM user_denied_capabilities udc
 *        JOIN capabilities c ON c.id = udc.capability_id
 *        WHERE udc.user_id = $1`,
 *       [user.id],
 *     );
 *
 *     return {
 *       roles: rolesResult.rows.map((r) => r.name),
 *       additionalCapabilities: additionalResult.rows,
 *       deniedCapabilities: deniedResult.rows,
 *     };
 *   }
 * }
 *
 * // ── 3. Module wiring ─────────────────────────────────────────────────────
 * @Module({
 *   imports: [
 *     CaslModule.forRoot({
 *       roleProvider: {
 *         useFactory: (pool: Pool) => new PgRoleProvider(pool),
 *         inject: [Pool],
 *       },
 *       userContextResolver: JwtUserContextResolver,
 *       userCapabilityProvider: {
 *         useFactory: (pool: Pool) => new PgUserCapabilityProvider(pool),
 *         inject: [Pool],
 *       },
 *     }),
 *     PipelineModule.forRoot({
 *       globalBehaviors: { scope: 'all', before: [CaslBehavior] },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 *
 * // ── 4. Simple type-level check (no subjectFromRequest) ─────────────
 * // CASL only verifies "can the user read Posts at all?" — no conditions
 * // are evaluated against the query payload.
 * @QueryHandler(GetPostsByAuthorQuery)
 * @UsePipeline([CaslBehavior, {
 *   rules: [{ action: 'read', subject: 'Post' }],
 * }])
 * class GetPostsByAuthorHandler { ... }
 *
 * // ── 5. Instance-level check with subjectFromRequest ──────────────────
 * // CASL evaluates conditions (e.g. authorId = ${user.id}) against the
 * // command payload, so a user can only update their own posts.
 * @CommandHandler(UpdatePostCommand)
 * @UsePipeline([CaslBehavior, {
 *   subjectFromRequest: 'Post',
 *   rules: [{ action: 'update', subject: 'Post' }],
 * }])
 * class UpdatePostHandler { ... }
 *
 * // ── 6. Multi-tenant command with complex conditions ──────────────────
 * // Capability: Project|update|{"tenantId":"${user.tenantId}","status":{"$in":["active","planning"]}}
 * // subjectFromRequest makes CASL check tenantId and status on the command.
 * @CommandHandler(UpdateProjectCommand)
 * @UsePipeline([CaslBehavior, {
 *   subjectFromRequest: 'Project',
 *   rules: [{ action: 'update', subject: 'Project' }],
 * }])
 * class UpdateProjectHandler { ... }
 *
 * // ── 7. Cross-resource command — multiple requirements ────────────────
 * // User must be able to update Order.status AND create AuditLog.
 * // subjectFromRequest: 'Order' evaluates conditions against the command
 * // for the Order requirement; the AuditLog check remains type-level.
 * @CommandHandler(FulfillOrderCommand)
 * @UsePipeline([CaslBehavior, {
 *   subjectFromRequest: 'Order',
 *   rules: [
 *     { action: 'update', subject: 'Order', field: 'status' },
 *     { action: 'create', subject: 'AuditLog' },
 *   ],
 * }])
 * class FulfillOrderHandler { ... }
 *
 * // ── 8. Public endpoint with skipCheck ────────────────────────────────
 * // Anyone can list posts, but the handler uses the ability to decide
 * // what to include (e.g. drafts, restricted fields).
 * @QueryHandler(ListPostsQuery)
 * @UsePipeline([CaslBehavior, { skipCheck: true }])
 * class ListPostsHandler implements IQueryHandler<ListPostsQuery> {
 *   async execute(query: ListPostsQuery, context: IPipelineContext) {
 *     const ability = context.items.get(CASL_ABILITY_KEY) as AppAbility;
 *     const includeDrafts = ability?.can('read', 'DraftPost');
 *     // Tailor the response based on what the user can see
 *   }
 * }
 *
 * // ── 9. Delete with ownership conditions ──────────────────────────────
 * // Capability: Comment|delete|{"authorId":"${user.id}","status":"draft"}
 * // Only delete own draft comments.
 * @CommandHandler(DeleteCommentCommand)
 * @UsePipeline([CaslBehavior, {
 *   subjectFromRequest: 'Comment',
 *   rules: [{ action: 'delete', subject: 'Comment' }],
 * }])
 * class DeleteCommentHandler { ... }
 *
 * // ── 10. Event with authorization (restrict who can trigger) ──────────
 * @UsePipeline([CaslBehavior, {
 *   rules: [{ action: 'publish', subject: 'Post' }],
 * }])
 * class PostPublishedHandler { ... }
 * ```
 */
@Injectable()
export class CaslBehavior implements IPipelineBehavior {
  private readonly logger: LoggerService;

  constructor(
    @Inject(CASL_ROLE_PROVIDER)
    private readonly roleProvider: IRoleProvider,

    @Optional()
    @Inject(CASL_USER_CONTEXT_RESOLVER)
    private readonly userContextResolver?: IUserContextResolver,

    @Optional()
    @Inject(CASL_USER_CAPABILITY_PROVIDER)
    private readonly userCapabilityProvider?: IUserCapabilityProvider,

    @Optional()
    @Inject(CASL_BEHAVIOR_LOGGER)
    logger?: LoggerService,
  ) {
    this.logger = logger ?? new Logger(CaslBehavior.name, { timestamp: true });
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options =
      context.getBehaviorOptions<CaslBehaviorOptions>(CaslBehavior);

    const requirements = options?.rules;

    // No requirements, no prebuiltAbility, and no skipCheck? Just pass through
    if (!requirements && !options?.prebuiltAbility && !options?.skipCheck) {
      return next();
    }

    // Resolve user context
    const user = await this.resolveUser(context);

    if (!user && requirements && requirements.length > 0) {
      this.logger.warn?.(
        'Authorization required but no user context found. ' +
          `Set "${CASL_USER_CONTEXT_KEY}" in context.items or provide a CASL_USER_CONTEXT_RESOLVER.`,
      );
      throw new ForbiddenException('Access denied — authentication required.');
    }

    // Build or use prebuilt ability
    let ability: AppAbility;

    if (options?.prebuiltAbility) {
      ability = options.prebuiltAbility;
    } else if (user) {
      ability = await this.buildAbilityForUser(user);
    } else {
      // No user, no requirements — pass through
      return next();
    }

    // Store ability for downstream consumers
    context.items.set(CASL_ABILITY_KEY, ability);

    // Skip actual checking if flagged
    if (options?.skipCheck) {
      return next();
    }

    // Check all requirements
    if (requirements && requirements.length > 0) {
      this.checkRequirements(
        ability,
        requirements,
        context,
        options?.subjectFromRequest,
      );
    }

    return next();
  }

  private async resolveUser(
    context: IPipelineContext,
  ): Promise<CaslUserContext | undefined> {
    if (this.userContextResolver) {
      return this.userContextResolver.resolve(context.items);
    }
    return context.items.get(CASL_USER_CONTEXT_KEY) as
      | CaslUserContext
      | undefined;
  }

  private async buildAbilityForUser(
    user: CaslUserContext,
  ): Promise<AppAbility> {
    // Load per-user capability overrides if provider exists
    let additional: undefined | Array<Capability | CapabilityString>;
    let denied: typeof additional;

    if (this.userCapabilityProvider) {
      const userCaps =
        await this.userCapabilityProvider.getUserCapabilities(user);
      const roleNames = userCaps.roles;
      const roles = await this.roleProvider.getRoles(roleNames);
      additional = userCaps.additionalCapabilities;
      denied = userCaps.deniedCapabilities;
      return buildAbility(roles, user, additional, denied);
    }

    // No IUserCapabilityProvider — cannot load user roles.
    throw new Error(
      'No IUserCapabilityProvider registered — cannot determine user roles. ' +
        'Register an IUserCapabilityProvider or use CaslBehaviorOptions.prebuiltAbility.',
    );
  }

  private checkRequirements(
    ability: AppAbility,
    requirements: AbilityRequirement[],
    context: IPipelineContext,
    subjectFromRequest?: string | string[],
  ): void {
    const instanceSubjects = Array.isArray(subjectFromRequest)
      ? subjectFromRequest
      : subjectFromRequest
        ? [subjectFromRequest]
        : [];

    for (const req of requirements) {
      try {
        if (instanceSubjects.includes(req.subject)) {
          // Instance-level check: evaluate conditions against the request payload.
          // Shallow-copy to avoid CASL's subject-type stamp conflicting when
          // multiple subjects are checked against the same request object.
          const sub = caslSubject(req.subject, {
            ...(context.request as Record<string, unknown>),
          }) as unknown as string;
          if (req.field) {
            ForbiddenError.from(ability).throwUnlessCan(
              req.action,
              sub,
              req.field,
            );
          } else {
            ForbiddenError.from(ability).throwUnlessCan(req.action, sub);
          }
        } else {
          // Type-level check: can user perform action on at least one instance?
          if (req.field) {
            ForbiddenError.from(ability).throwUnlessCan(
              req.action,
              req.subject,
              req.field,
            );
          } else {
            ForbiddenError.from(ability).throwUnlessCan(
              req.action,
              req.subject,
            );
          }
        }
      } catch (error: unknown) {
        if (error instanceof ForbiddenError) {
          this.logger.debug?.(
            `Authorization failed: ${error.message} ` +
              `(action=${req.action}, subject=${req.subject}${req.field ? `, field=${req.field}` : ''})`,
          );
          throw new ForbiddenException(
            'Access denied — insufficient permissions.',
          );
        }
        throw error;
      }
    }
  }
}
