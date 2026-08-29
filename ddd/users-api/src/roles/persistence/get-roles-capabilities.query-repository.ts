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

import { Inject, Injectable } from '@nestjs/common';
import type { IRoleProvider, RoleDefinition } from '@nestjs-pipeline/casl';
import { FromCache, ICache, QueryRepository } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { RoleCapability } from '@persistence/entities/role-capability.entity';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { GetRolesCapabilitiesQuery } from '../cqrs/queries/get-roles-capabilities.query';
import { Capability } from '../domain/models/capability.entity';
import { Role } from '../domain/models/role.entity';

@Injectable()
export class GetRolesCapabilitiesQueryRepository
  extends QueryRepository<GetRolesCapabilitiesQuery, RoleDefinition[]>
  implements IRoleProvider
{
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<RoleDefinition[]>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  async getRoles(names?: string[]): Promise<RoleDefinition[]> {
    return this.find(new GetRolesCapabilitiesQuery({ names }));
  }

  @FromCache<GetRolesCapabilitiesQuery, RoleDefinition[]>(
    (q) => `roles:capabilities:${q.names?.sort().join(',') ?? 'all'}`,
  )
  async find(query: GetRolesCapabilitiesQuery): Promise<RoleDefinition[]> {
    const { names } = query;
    if (!names || names.length === 0) {
      // If no role names are provided, return an empty array (no roles)
      return [];
    }

    const em = this.store.em;
    const roles = await em.find(Role, { _name: { $in: names } } as never);

    return this.hydrate(em, roles);
  }

  private async hydrate(
    em: MikroOrmStore['em'],
    roles: Role[],
  ): Promise<RoleDefinition[]> {
    if (roles.length === 0) return [];

    const links = await em.find(RoleCapability, {
      roleId: { $in: roles.map((role) => role.id) },
    });
    const capabilityIds = [...new Set(links.map((link) => link.capabilityId))];
    const capabilities =
      capabilityIds.length === 0
        ? []
        : await em.find(Capability, {
            id: { $in: capabilityIds },
          } as never);
    const capabilityById = new Map(
      capabilities.map((capability) => [capability.id, capability]),
    );

    const capsByRole = new Map<string, RoleDefinition['capabilities']>();
    for (const link of links) {
      const roleId = link.roleId;
      const capability = capabilityById.get(link.capabilityId);
      if (!capability) continue;
      if (!capsByRole.has(roleId)) capsByRole.set(roleId, []);

      // biome-ignore lint/style/noNonNullAssertion: role bucket exists after has()/set() guard
      capsByRole.get(roleId)!.push({
        subject: capability.subject,
        action: capability.action,
        conditions: capability.conditions
          ? JSON.parse(capability.conditions)
          : undefined,
        inverted: capability.inverted,
        reason: capability.reason || undefined,
        fields: capability.fields ? capability.fields.split(',') : undefined,
      });
    }

    return roles.map((role) => ({
      name: role.name,
      capabilities: capsByRole.get(role.id) ?? [],
    }));
  }
}
