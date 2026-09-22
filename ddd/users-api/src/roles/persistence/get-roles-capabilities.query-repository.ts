/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import { capabilityFromRow } from '@persistence/capability-row.mapper';
import { RoleCapability } from '@persistence/entities/role-capability.entity';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import type { RoleDefinition } from '../../auths/application/permission-assignments';
import { GetRolesCapabilitiesQuery } from '../cqrs/queries/get-roles-capabilities.query';
import { Capability } from '../domain/models/capability.entity';
import { Role } from '../domain/models/role.entity';

@Injectable()
export class GetRolesCapabilitiesQueryRepository {
  constructor(
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {}

  async getRoles(names?: string[]): Promise<RoleDefinition[]> {
    return this.find(new GetRolesCapabilitiesQuery({ names }));
  }

  async find(query: GetRolesCapabilitiesQuery): Promise<RoleDefinition[]> {
    const { names } = query;
    if (names?.length === 0) return [];

    const em = this.store.em;
    const roles = await em.find(
      Role,
      names === undefined ? {} : { name: { $in: names } },
    );

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
      capsByRole.get(roleId)!.push(capabilityFromRow(capability));
    }

    return roles.map((role) => ({
      name: role.name,
      capabilities: capsByRole.get(role.id) ?? [],
    }));
  }
}
