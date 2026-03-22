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
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
 */
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import type { User } from '../../domain/models/user.entity';
import { QUERY_REPOSITORY } from '../../repository.tokens';
import { GetUserQuery } from './get-user.query';

@QueryHandler(GetUserQuery)
export class GetUserHandler implements IQueryHandler<GetUserQuery, User> {
  constructor(
    @Inject(QUERY_REPOSITORY.getUser)
    private readonly queryRepository: IQueryRepository<GetUserQuery, User>,
  ) {}

  async execute(query: GetUserQuery): Promise<User> {
    return await this.queryRepository.find(query);
  }
}
