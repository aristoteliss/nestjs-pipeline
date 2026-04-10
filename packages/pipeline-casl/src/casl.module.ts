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

import {
  DynamicModule,
  InjectionToken,
  Module,
  Provider,
  Type,
} from '@nestjs/common';
import type { CaslBehaviorOptions } from './casl.behavior';
import { CaslBehavior } from './casl.behavior';
import {
  CASL_FIELDS_FROM_REQUEST,
  CASL_ROLE_PROVIDER,
  CASL_SUBJECT_CONTEXT_PATHS,
  CASL_USER_CAPABILITY_PROVIDER,
  CASL_USER_CONTEXT_RESOLVER,
} from './constants/tokens';
import type {
  IRoleProvider,
  IUserCapabilityProvider,
  IUserContextResolver,
} from './interfaces/providers.interface';

/**
 * Options for configuring the CASL pipeline module.
 */
export interface CaslModuleOptions {
  /**
   * The role provider implementation (required).
   * Use `useClass`, `useExisting`, or `useFactory`.
   */
  roleProvider:
  | Type<IRoleProvider>
  | { useClass: Type<IRoleProvider> }
  | { useExisting: Type<IRoleProvider> }
  | {
    useFactory: (
      ...args: never[]
    ) => IRoleProvider | Promise<IRoleProvider>;
    inject?: InjectionToken[];
  };

  /**
   * Optional user context resolver.
   * Extracts the current user from the pipeline context items bag.
   */
  userContextResolver?:
  | Type<IUserContextResolver>
  | { useClass: Type<IUserContextResolver> }
  | { useExisting: Type<IUserContextResolver> }
  | {
    useFactory: (
      ...args: never[]
    ) => IUserContextResolver | Promise<IUserContextResolver>;
    inject?: InjectionToken[];
  };

  /**
   * Per-user capability provider.
   *
   * **Required at runtime** for handlers that use `CaslBehaviorOptions.rules` —
   * if not registered, those handlers will throw an `Error` because user
   * roles cannot be determined.  Only omit this if every handler uses
   * `CaslBehaviorOptions.prebuiltAbility` or `skipCheck: true`.
   *
   * Provides the current user's role names plus any per-user additional
   * and denied capabilities.
   */
  userCapabilityProvider?:
  | Type<IUserCapabilityProvider>
  | { useClass: Type<IUserCapabilityProvider> }
  | { useExisting: Type<IUserCapabilityProvider> }
  | {
    useFactory: (
      ...args: never[]
    ) => IUserCapabilityProvider | Promise<IUserCapabilityProvider>;
    inject?: InjectionToken[];
  };

  /**
   * Global default request paths used by CaslBehavior to extract contextual
   * session/user fields for instance-level checks.
   *
   * This avoids repeating `subjectContextPaths` in every handler.
   */
  subjectContextPaths: string[];

  /**
   * Global default for extracting/updating field checks from request payloads.
   *
   * This is used when a handler does not provide
   * `CaslBehaviorOptions.fieldsFromRequest`.
   */
  defaultFieldsFromRequest?: CaslBehaviorOptions['fieldsFromRequest'];
}

function toProvider(
  token: symbol,
  value:
    | Type
    | { useClass: Type }
    | { useExisting: Type }
    | { useFactory: (...args: never[]) => unknown; inject?: InjectionToken[] }
    | undefined,
): Provider | undefined {
  if (!value) return undefined;

  if (typeof value === 'function') {
    return { provide: token, useClass: value };
  }
  if ('useClass' in value) {
    return { provide: token, useClass: value.useClass };
  }
  if ('useExisting' in value) {
    return { provide: token, useExisting: value.useExisting };
  }
  if ('useFactory' in value) {
    return {
      provide: token,
      useFactory: value.useFactory,
      inject: value.inject ?? [],
    };
  }
  return undefined;
}

/**
 * NestJS module that registers the CASL authorization behavior and its providers.
 *
 * @example Basic registration
 * ```ts
 * import { CaslModule, CaslBehavior } from '@nestjs-pipeline/casl';
 *
 * @Module({
 *   imports: [
 *     CaslModule.forRoot({
 *       roleProvider: YamlRoleProvider,
 *       userContextResolver: JwtUserContextResolver,
 *       userCapabilityProvider: DatabaseUserCapabilityProvider,
 *     }),
 *     PipelineModule.forRoot({
 *       globalBehaviors: {
 *         scope: 'all',
 *         before: [CaslBehavior],
 *       },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @example Suggested relational schema (see {@link Capability} for full details)
 * ```sql
 * -- Capabilities are stored as individual rows with indexed subject/action columns.
 * -- See the Capability type JSDoc for the complete column-to-property mapping and
 * -- junction table layout (role_capabilities, user_additional_capabilities,
 * -- user_denied_capabilities, user_roles).
 * ```
 *
 * @example PostgreSQL-backed IRoleProvider
 * ```ts
 * import { Injectable } from '@nestjs/common';
 * import { Pool } from 'pg';
 * import type { IRoleProvider, RoleDefinition } from '@nestjs-pipeline/casl';
 *
 * @Injectable()
 * export class PgRoleProvider implements IRoleProvider {
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
 * ```
 *
 * @example PostgreSQL-backed IUserCapabilityProvider
 * ```ts
 * import { Injectable } from '@nestjs/common';
 * import { Pool } from 'pg';
 * import type {
 *   IUserCapabilityProvider,
 *   UserCapabilities,
 *   CaslUserContext,
 * } from '@nestjs-pipeline/casl';
 *
 * @Injectable()
 * export class PgUserCapabilityProvider implements IUserCapabilityProvider {
 *   constructor(private readonly pool: Pool) {}
 *
 *   async getUserCapabilities(user: CaslUserContext): Promise<UserCapabilities> {
 *     // 1. Fetch role names via user_roles junction
 *     const rolesResult = await this.pool.query(
 *       'SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1',
 *       [user.id],
 *     );
 *
 *     // 2. Fetch per-user additional capabilities via junction
 *     const additionalResult = await this.pool.query(
 *       `SELECT c.subject, c.action, c.conditions, c.inverted, c.reason, c.fields
 *        FROM user_additional_capabilities uac
 *        JOIN capabilities c ON c.id = uac.capability_id
 *        WHERE uac.user_id = $1`,
 *       [user.id],
 *     );
 *
 *     // 3. Fetch per-user denied capabilities via junction
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
 * ```
 *
 * @example Wiring PostgreSQL providers with a factory
 * ```ts
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
 *       globalBehaviors: {
 *         scope: 'all',
 *         before: [CaslBehavior],
 *       },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: static-only class
export class CaslModule {
  static forRoot(options: CaslModuleOptions): DynamicModule {
    const providers: Provider[] = [CaslBehavior];

    providers.push({
      provide: CASL_SUBJECT_CONTEXT_PATHS,
      useValue: options.subjectContextPaths,
    });

    providers.push({
      provide: CASL_FIELDS_FROM_REQUEST,
      useValue: options.defaultFieldsFromRequest,
    });

    const roleProvider = toProvider(CASL_ROLE_PROVIDER, options.roleProvider);
    if (roleProvider) providers.push(roleProvider);

    const userContextResolver = toProvider(
      CASL_USER_CONTEXT_RESOLVER,
      options.userContextResolver,
    );
    if (userContextResolver) providers.push(userContextResolver);

    const userCapabilityProvider = toProvider(
      CASL_USER_CAPABILITY_PROVIDER,
      options.userCapabilityProvider,
    );
    if (userCapabilityProvider) providers.push(userCapabilityProvider);

    return {
      module: CaslModule,
      global: true,
      providers,
      exports: [
        CaslBehavior,
        CASL_FIELDS_FROM_REQUEST,
        CASL_ROLE_PROVIDER,
        CASL_SUBJECT_CONTEXT_PATHS,
        ...(userContextResolver ? [CASL_USER_CONTEXT_RESOLVER] : []),
        ...(userCapabilityProvider ? [CASL_USER_CAPABILITY_PROVIDER] : []),
      ],
    };
  }
}
