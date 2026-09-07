/*
 * Copyright (C) 2026-present Aristotelis
 * See repository license for full terms.
 */

import { Injectable } from '@nestjs/common';
import type { CaslUserContext } from '@nestjs-pipeline/casl';
import type { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { Inject } from '@nestjs/common';
import { GetUserContextQuery } from '../cqrs/queries/get-user-context.query';
import { User } from '../domain/models/user.entity';

/**
 * Persistence-only read repository for resolving a database user's authorization
 * context. Request/session parsing and principal acceptance policy live in the
 * separate `CaslUserContextResolver` application service.
 */
@Injectable()
export class GetUserContextQueryRepository
  implements IQueryRepository<GetUserContextQuery, CaslUserContext | null>
{
  constructor(
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {}

  async find(query: GetUserContextQuery): Promise<CaslUserContext | null> {
    const user = await this.store.em.findOne(User, { id: query.userId });
    if (!user) return null;

    return {
      id: user.id,
      department: user.department as string | null,
    } as CaslUserContext;
  }
}
