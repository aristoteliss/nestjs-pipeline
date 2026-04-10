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

import { IPipelineContext } from '@nestjs-pipeline/core';
import type {
  CaslUserContext,
  RoleDefinition,
  UserCapabilities,
} from '../types/casl.types';

/**
 * Resolves the {@link CaslUserContext} from the pipeline context items bag.
 *
 * Implement this interface to extract the current user from wherever your
 * authentication layer puts it (e.g. JWT payload on the request, session, etc.).
 *
 * Register it with the `CASL_USER_CONTEXT_RESOLVER` injection token.
 *
 * @example PostgreSQL – resolve user context from JWT, then enrich from the database
 * ```ts
 * @Injectable()
 * export class PgUserContextResolver implements IUserContextResolver {
 *   constructor(private readonly pool: Pool) {}
 *
 *   async resolve(context: IPipelineContext): Promise<CaslUserContext | undefined> {
 *     const jwt = context.items.get('jwt') as { sub: string } | undefined;
 *     if (!jwt) return undefined;
 *
 *     const { rows } = await this.pool.query(
 *       'SELECT id, tenant_id AS "tenantId", department FROM users WHERE id = $1',
 *       [jwt.sub],
 *     );
 *     return rows[0]; // { id, tenantId, department } → used for condition interpolation
 *   }
 * }
 * ```
 */
export interface IUserContextResolver {
  resolve(
    context: IPipelineContext,
  ): CaslUserContext | null | Promise<CaslUserContext | null>;
}

/**
 * Provides role definitions to the CASL behavior.
 *
 * Implement this interface to load roles from a database, YAML file,
 * configuration service, or any other source.
 *
 * Register it with the `CASL_ROLE_PROVIDER` injection token.
 *
 * @example PostgreSQL-backed implementation (relational schema)
 * ```ts
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
 */
export interface IRoleProvider {
  /**
   * Return role definitions.
   *
   * @param names - When provided, return only roles whose name is in the array.
   *                When omitted, return **all** role definitions.
   */
  getRoles(names?: string[]): Promise<RoleDefinition[]> | RoleDefinition[];
}

/**
 * Provides per-user capability overrides.
 *
 * Implement this interface to load additional capabilities for a specific
 * user that go beyond their role-based permissions.
 *
 * Register it with the `CASL_USER_CAPABILITY_PROVIDER` injection token.
 *
 * @example PostgreSQL-backed implementation (relational schema)
 * ```ts
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
 */
export interface IUserCapabilityProvider {
  /**
   * Return the extra capabilities for a user.
   * @param user - The resolved user context.
   */
  getUserCapabilities(
    user: CaslUserContext,
  ): Promise<UserCapabilities> | UserCapabilities;
}
