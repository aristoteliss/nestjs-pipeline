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

import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { RoleDefinition } from '@nestjs-pipeline/casl';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { QUERY_REPOSITORY } from '../../persistence/repository.tokens';
import { GetRolesCapabilitiesQuery } from './get-roles-capabilities.query';

@QueryHandler(GetRolesCapabilitiesQuery)
export class GetRolesCapabilitiesHandler
  implements IQueryHandler<GetRolesCapabilitiesQuery, RoleDefinition[]> {
  constructor(
    @Inject(QUERY_REPOSITORY.getRolesCapabilities)
    private readonly queryRepository: IQueryRepository<
      GetRolesCapabilitiesQuery,
      RoleDefinition[]
    >,
  ) { }

  async execute(query: GetRolesCapabilitiesQuery): Promise<RoleDefinition[]> {
    return await this.queryRepository.find(query);
  }
}
