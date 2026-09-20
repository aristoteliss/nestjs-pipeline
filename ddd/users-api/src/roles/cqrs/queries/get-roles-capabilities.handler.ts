/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core/application';
import type { RoleDefinition } from '../../../auths/application/permission-assignments';
import { QUERY_REPOSITORY } from '../../persistence/repository.tokens';
import { GetRolesCapabilitiesQuery } from './get-roles-capabilities.query';

@QueryHandler(GetRolesCapabilitiesQuery)
export class GetRolesCapabilitiesHandler
  implements IQueryHandler<GetRolesCapabilitiesQuery, RoleDefinition[]>
{
  constructor(
    @Inject(QUERY_REPOSITORY.getRolesCapabilities)
    private readonly queryRepository: IQueryRepository<
      GetRolesCapabilitiesQuery,
      RoleDefinition[]
    >,
  ) {}

  async execute(query: GetRolesCapabilitiesQuery): Promise<RoleDefinition[]> {
    return await this.queryRepository.find(query);
  }
}
