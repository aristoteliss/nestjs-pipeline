/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import type { IQueryRepository } from '@nestjs-pipeline/ddd-core/application';
import { UserAdditionalCapability } from '@persistence/entities/user-additional-capability.entity';
import { UserDeniedCapability } from '@persistence/entities/user-denied-capability.entity';
import { UserRole } from '@persistence/entities/user-role.entity';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { Capability } from '../../roles/domain/models/capability.entity';
import { Role } from '../../roles/domain/models/role.entity';
import type { UserPermissionAssignments } from '../application/permission-assignments';
import { GetUserCapabilitiesQuery } from '../cqrs/queries/get-user-capabilities.query';

/**
 * Query repository resolving a user's role names and per-user grants and denials.
 */
@Injectable()
export class GetUserCapabilitiesQueryRepository
  implements
    IQueryRepository<GetUserCapabilitiesQuery, UserPermissionAssignments>
{
  constructor(
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {}

  async find(
    query: GetUserCapabilitiesQuery,
  ): Promise<UserPermissionAssignments> {
    const userId = String(query.userId);
    const em = this.store.em;

    // Use entity operations so a PostgreSQL EntityManager fork applies its
    // tenant schema. Raw execute() SQL would use the connection search_path.
    const [userRoles, additionalLinks, deniedLinks] = await Promise.all([
      em.find(UserRole, { userId }),
      em.find(UserAdditionalCapability, { userId }),
      em.find(UserDeniedCapability, { userId }),
    ]);

    const roleIds = userRoles.map((link) => String(link.roleId));
    const additionalIds = additionalLinks.map((link) =>
      String(link.capabilityId),
    );
    const deniedIds = deniedLinks.map((link) => String(link.capabilityId));
    const [rolesResult, additionalResult, deniedResult] = await Promise.all([
      roleIds.length === 0
        ? Promise.resolve([])
        : em.find(Role, { id: { $in: roleIds } } as never),
      additionalIds.length === 0
        ? Promise.resolve([])
        : em.find(Capability, { id: { $in: additionalIds } } as never),
      deniedIds.length === 0
        ? Promise.resolve([])
        : em.find(Capability, { id: { $in: deniedIds } } as never),
    ]);

    const toCapability = (capability: Capability) => ({
      subject: capability.subject,
      action: capability.action,
      conditions: capability.conditions
        ? JSON.parse(capability.conditions)
        : undefined,
      inverted: capability.inverted,
      reason: capability.reason ?? undefined,
      fields: capability.fields ? capability.fields.split(',') : undefined,
    });

    return {
      roles: rolesResult.map((role) => role.name),
      additionalCapabilities: additionalResult.map(toCapability),
      deniedCapabilities: deniedResult.map(toCapability),
    };
  }
}
