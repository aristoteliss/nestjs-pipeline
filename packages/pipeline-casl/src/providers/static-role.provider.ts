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

import { Injectable } from '@nestjs/common';
import type { IRoleProvider } from '../interfaces/providers.interface';
import type { RoleDefinition } from '../types/casl.types';

/**
 * A simple static role provider that holds role definitions in memory.
 *
 * Use this when roles are defined in code or loaded from a config file
 * at startup — i.e. when you don't have a `roles` / `role_capabilities` /
 * `capabilities` relational schema (see {@link Capability}).
 *
 * Both {@link Capability} objects and {@link CapabilityString} shorthand are
 * accepted in the `capabilities` array. The compact strings are fine here
 * because they stay in memory — they are not persisted to a database.
 *
 * For database-backed roles, implement {@link IRoleProvider} with your own
 * service that queries `roles` → `role_capabilities` → `capabilities`.
 *
 * @example
 * ```ts
 * const roleProvider = new StaticRoleProvider([
 *   {
 *     name: 'admin',
 *     capabilities: ['all|manage|*'],
 *   },
 *   {
 *     name: 'author',
 *     capabilities: [
 *       'Post|read|*',
 *       'Post|create|*',
 *       'Post|update|{"authorId":"${id}"}',
 *       'Post|delete|{"authorId":"${id}"}',
 *       'Comment|read|*',
 *       'Comment|create|*',
 *     ],
 *   },
 *   {
 *     name: 'viewer',
 *     capabilities: ['Post|read|*', 'Comment|read|*'],
 *   },
 * ]);
 * ```
 *
 * @example Multi-tenant SaaS with field restrictions and conditional denials
 * ```ts
 * const roleProvider = new StaticRoleProvider([
 *   {
 *     name: 'tenant-admin',
 *     capabilities: [
 *       // Manage all resources scoped to own tenant
 *       'User|manage|{"tenantId":"${user.tenantId}"}',
 *       'Project|manage|{"tenantId":"${user.tenantId}"}',
 *       'Invoice|read|{"tenantId":"${user.tenantId}"}',
 *       // Cannot delete invoices even within own tenant
 *       '!Invoice|delete|*',
 *     ],
 *   },
 *   {
 *     name: 'project-manager',
 *     capabilities: [
 *       'Project|read|{"tenantId":"${user.tenantId}"}',
 *       // Can only update projects they are a member of, and only in active status
 *       'Project|update|{"tenantId":"${user.tenantId}","members":{"$elemMatch":{"userId":"${user.id}"}},"status":{"$in":["active","planning"]}}',
 *       // Manage tasks within own tenant projects
 *       'Task|manage|{"tenantId":"${user.tenantId}","assigneeId":"${user.id}"}',
 *       'Task|read|{"tenantId":"${user.tenantId}"}',
 *       // Read comments, create own comments, delete only own draft comments
 *       'Comment|read|{"tenantId":"${user.tenantId}"}',
 *       'Comment|create|*',
 *       'Comment|delete|{"authorId":"${user.id}","status":"draft"}',
 *     ],
 *   },
 *   {
 *     name: 'auditor',
 *     capabilities: [
 *       // Read-only across all subjects within tenant, restricted fields on User
 *       'User|read|{"tenantId":"${user.tenantId}"}|id,name,email,role',
 *       'Project|read|{"tenantId":"${user.tenantId}"}',
 *       'Invoice|read|{"tenantId":"${user.tenantId}"}',
 *       'AuditLog|read|{"tenantId":"${user.tenantId}"}',
 *       // Explicitly denied: cannot read or manage anything else
 *       '!User|update|*',
 *     ],
 *   },
 * ]);
 * ```
 */
@Injectable()
export class StaticRoleProvider implements IRoleProvider {
  private readonly roles: Map<string, RoleDefinition>;

  constructor(definitions: RoleDefinition[]) {
    this.roles = new Map(definitions.map((d) => [d.name, d]));
  }

  getRoles(names?: string[]): RoleDefinition[] {
    if (!names) return Array.from(this.roles.values());
    const result: RoleDefinition[] = [];
    for (const name of names) {
      const role = this.roles.get(name);
      if (role) result.push(role);
    }
    return result;
  }
}
