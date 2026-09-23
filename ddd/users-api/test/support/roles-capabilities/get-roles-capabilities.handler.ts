/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core/application';
import { GetRolesCapabilitiesQuery } from './get-roles-capabilities.query';
import type { RoleDefinition } from './get-roles-capabilities.query-repository';

export const GET_ROLES_CAPABILITIES_REPOSITORY = Symbol('getRolesCapabilities');

@QueryHandler(GetRolesCapabilitiesQuery)
export class GetRolesCapabilitiesHandler
  implements IQueryHandler<GetRolesCapabilitiesQuery, RoleDefinition[]>
{
  constructor(
    @Inject(GET_ROLES_CAPABILITIES_REPOSITORY)
    private readonly queryRepository: IQueryRepository<
      GetRolesCapabilitiesQuery,
      RoleDefinition[]
    >,
  ) {}

  async execute(query: GetRolesCapabilitiesQuery): Promise<RoleDefinition[]> {
    return await this.queryRepository.find(query);
  }
}
