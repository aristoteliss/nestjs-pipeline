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
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { UserCapabilities } from '@nestjs-pipeline/casl';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { QUERY_REPOSITORY } from '../../repositories/repository.tokens';
import { GetUserCapabilitiesQuery } from './get-user-capabilities.query';

@QueryHandler(GetUserCapabilitiesQuery)
export class GetUserCapabilitiesHandler
  implements IQueryHandler<GetUserCapabilitiesQuery, UserCapabilities> {
  constructor(
    @Inject(QUERY_REPOSITORY.getUserCapabilities)
    private readonly queryRepository: IQueryRepository<
      GetUserCapabilitiesQuery,
      UserCapabilities
    >,
  ) { }

  async execute(query: GetUserCapabilitiesQuery): Promise<UserCapabilities> {
    return await this.queryRepository.find(query);
  }
}
