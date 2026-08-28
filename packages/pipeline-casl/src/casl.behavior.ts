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
  CASL_FIELDS_FROM_REQUEST,
  CASL_ROLE_PROVIDER,
  CASL_SUBJECT_CONTEXT_PATHS,
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
  CaslUserContext,
  UserCapabilities,
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
   * Optional request paths that may contain session/user context to be merged
   * into instance-level CASL subject checks.
   *
   * This is useful when request DTOs do not expose tenant/user fields at the
   * root level but keep them under a nested session object.
   *
   * Paths use dot notation and are checked in order. The first path that
   * resolves to an object is used.
   *
   * @example
   * ```ts
   * @UsePipeline([CaslBehavior, {
   *   subjectFromRequest: 'User',
   *   subjectContextPaths: ['auth.session.user', 'sessionUser'],
   *   rules: [{ action: 'update', subject: 'User' }],
   * }])
   * ```
   */
  subjectContextPaths?: string[];

  /**
   * Optional list or per-subject map of request fields that should be checked
   * as CASL field-level permissions for instance-level requirements.
   *
   * Important: this option does not grant access by itself. It only tells
   * CaslBehavior which fields to validate. Actual permissions still come
   * from capabilities/rules in the built ability.
   *
   * When configured, each present field (value !== undefined) is checked with
   * `throwUnlessCan(action, subject, field)`.
   *
   * This enables partial-update authorization policies such as:
   * - allow updating `username`
   * - deny updating `department`
   *
   * @example Single subject update command
   * ```ts
   * @UsePipeline([CaslBehavior, {
   *   subjectFromRequest: 'User',
   *   fieldsFromRequest: ['username', 'department'],
   *   rules: [{ action: 'update', subject: 'User' }],
   * }])
   * ```
   *
   * @example Multi-subject command
   * ```ts
   * @UsePipeline([CaslBehavior, {
   *   subjectFromRequest: ['Project', 'Task'],
   *   fieldsFromRequest: {
   *     Project: ['name', 'status'],
   *     Task: ['title', 'priority'],
   *   },
   *   rules: [
   *     { action: 'update', subject: 'Project' },
   *     { action: 'update', subject: 'Task' },
   *   ],
   * }])
   * ```
   */
  fieldsFromRequest?: string[] | Record<string, string[]>;

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
   * //
   * // Handlers receive only the query/command argument; read the ability from
   * // the ambient pipeline store with getCaslAbility().
   * @QueryHandler(ListPostsQuery)
   * @UsePipeline([CaslBehavior, { skipCheck: true }])
   * class ListPostsHandler implements IQueryHandler<ListPostsQuery> {
   *   async execute(query: ListPostsQuery) {
   *     const ability = getCaslAbility();
   *     const includeDrafts = ability?.can('read', 'DraftPost');
   *     // ... fetch posts accordingly
   *   }
   * }
   * ```
   */
  skipCheck?: boolean;

  /**
   * Provide a pre-built ability directly instead of resolving one from providers.
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

    @Optional()
    @Inject(CASL_SUBJECT_CONTEXT_PATHS)
    private readonly globalSubjectContextPaths?: string[],

    @Optional()
    @Inject(CASL_FIELDS_FROM_REQUEST)
    private readonly globalFieldsFromRequest?:
      | string[]
      | Record<string, string[]>,
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

    // No requirements, no prebuiltAbility, and no skipCheck? Just pass through.
    if (!requirements && !options?.prebuiltAbility && !options?.skipCheck) {
      return next();
    }

    // A prebuilt ability is already the complete authorization state. It must
    // bypass user/provider resolution entirely (useful for tests and callers
    // that construct abilities outside this behavior).
    let ability: AppAbility;
    if (options?.prebuiltAbility) {
      ability = options.prebuiltAbility;
    } else {
      const user = await this.resolveUser(context);

      if (!user && requirements && requirements.length > 0) {
        this.logger.warn?.(
          'Authorization required but no user context found. ' +
            `Set "${CASL_USER_CONTEXT_KEY}" in context.items or provide a CASL_USER_CONTEXT_RESOLVER.`,
        );
        throw new ForbiddenException('Access denied — authentication required.');
      }

      if (user) {
        ability = await this.buildAbilityForUser(user);
      } else {
        // No user and no prebuilt ability means there is no ability to expose.
        return next();
      }
    }

    // Store ability for downstream consumers.
    context.items.set(CASL_ABILITY_KEY, ability);

    // Skip actual checking if flagged.
    if (options?.skipCheck) {
      return next();
    }

    // Check all requirements.
    if (requirements && requirements.length > 0) {
      const effectiveFieldsFromRequest =
        options?.fieldsFromRequest ?? this.globalFieldsFromRequest;

      this.checkRequirements(
        ability,
        requirements,
        context,
        options?.subjectFromRequest,
        options?.subjectContextPaths,
        effectiveFieldsFromRequest,
      );
    }

    return next();
  }

  private async resolveUser(
    context: IPipelineContext,
  ): Promise<CaslUserContext | null> {
    if (this.userContextResolver) {
      return (await this.userContextResolver.resolve(context)) ?? null;
    }
    return context.items.get(CASL_USER_CONTEXT_KEY) as CaslUserContext | null;
  }

  private async buildAbilityForUser(
    user: CaslUserContext,
  ): Promise<AppAbility> {
    const preResolved = this.extractUserCapabilities(user);
    if (preResolved) {
      const roles = await this.roleProvider.getRoles(preResolved.roles);
      return buildAbility(
        roles,
        user,
        preResolved.additionalCapabilities,
        preResolved.deniedCapabilities,
      );
    }

    if (this.userCapabilityProvider) {
      const userCaps =
        await this.userCapabilityProvider.getUserCapabilities(user);
      const roles = await this.roleProvider.getRoles(userCaps.roles);
      return buildAbility(
        roles,
        user,
        userCaps.additionalCapabilities,
        userCaps.deniedCapabilities,
      );
    }

    throw new Error(
      'No IUserCapabilityProvider registered and no capabilities present on the ' +
        'user context — cannot determine user roles. Register an ' +
        'IUserCapabilityProvider, attach capabilities to the resolved user, or use ' +
        'CaslBehaviorOptions.prebuiltAbility.',
    );
  }

  private extractUserCapabilities(
    user: CaslUserContext,
  ): UserCapabilities | undefined {
    const candidate = (user as { capabilities?: unknown }).capabilities;
    if (!candidate || typeof candidate !== 'object') return undefined;

    const bag = candidate as Partial<UserCapabilities>;
    if (!Array.isArray(bag.roles)) return undefined;

    return {
      roles: bag.roles,
      additionalCapabilities: bag.additionalCapabilities,
      deniedCapabilities: bag.deniedCapabilities,
    };
  }

  private checkRequirements(
    ability: AppAbility,
    requirements: AbilityRequirement[],
    context: IPipelineContext,
    subjectFromRequest?: string | string[],
    subjectContextPaths?: string[],
    fieldsFromRequest?: string[] | Record<string, string[]>,
  ): void {
    const instanceSubjects = Array.isArray(subjectFromRequest)
      ? subjectFromRequest
      : subjectFromRequest
        ? [subjectFromRequest]
        : [];

    for (const req of requirements) {
      try {
        if (instanceSubjects.includes(req.subject)) {
          const requestPayload = context.request as
            | Record<string, unknown>
            | undefined;
          const instancePayload = this.buildInstanceSubjectPayload(
            requestPayload,
            subjectContextPaths,
          );
          const sub = caslSubject(req.subject, {
            ...instancePayload,
          }) as unknown as string;

          const requestedFields = this.resolveRequestedFields(
            req.subject,
            requestPayload,
            fieldsFromRequest,
          );

          if (req.field) {
            ForbiddenError.from(ability).throwUnlessCan(
              req.action,
              sub,
              req.field,
            );
          } else if (requestedFields.length > 0) {
            for (const field of requestedFields) {
              ForbiddenError.from(ability).throwUnlessCan(
                req.action,
                sub,
                field,
              );
            }
          } else {
            ForbiddenError.from(ability).throwUnlessCan(req.action, sub);
          }
        } else if (req.field) {
          ForbiddenError.from(ability).throwUnlessCan(
            req.action,
            req.subject,
            req.field,
          );
        } else {
          ForbiddenError.from(ability).throwUnlessCan(req.action, req.subject);
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

  private buildInstanceSubjectPayload(
    requestPayload: Record<string, unknown> | undefined,
    subjectContextPaths?: string[],
  ): Record<string, unknown> {
    if (!requestPayload) return {};

    const paths =
      subjectContextPaths && subjectContextPaths.length > 0
        ? subjectContextPaths
        : this.globalSubjectContextPaths &&
            this.globalSubjectContextPaths.length > 0
          ? this.globalSubjectContextPaths
          : [];

    const contextualPayload = this.resolveContextualPayload(
      requestPayload,
      paths,
    );

    return {
      ...(contextualPayload ?? {}),
      ...Object.fromEntries(
        Object.entries(requestPayload).filter(([, v]) => v !== undefined),
      ),
    };
  }

  private resolveContextualPayload(
    requestPayload: Record<string, unknown>,
    paths: string[],
  ): Record<string, unknown> | undefined {
    for (const path of paths) {
      const resolved = this.getNestedObject(requestPayload, path);
      if (resolved) {
        return resolved;
      }
    }
    return undefined;
  }

  private getNestedObject(
    source: Record<string, unknown>,
    path: string,
  ): Record<string, unknown> | undefined {
    const keys = path.split('.').filter(Boolean);
    if (keys.length === 0) return undefined;

    let current: unknown = source;
    for (const key of keys) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }

    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return current as Record<string, unknown>;
  }

  private resolveRequestedFields(
    subject: string,
    requestPayload: Record<string, unknown> | undefined,
    fieldsFromRequest?: string[] | Record<string, string[]>,
  ): string[] {
    if (!requestPayload || !fieldsFromRequest) return [];

    const configuredFields = Array.isArray(fieldsFromRequest)
      ? fieldsFromRequest
      : (fieldsFromRequest[subject] ?? []);

    return configuredFields.filter(
      (field) =>
        typeof field === 'string' && requestPayload[field] !== undefined,
    );
  }
}
