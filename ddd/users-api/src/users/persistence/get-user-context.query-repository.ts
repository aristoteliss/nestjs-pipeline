/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import type { CaslUserContext } from '@nestjs-pipeline/casl';
import type { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { GetUserContextQuery } from '../cqrs/queries/get-user-context.query';
import { User } from '../domain/models/user.entity';

/**
 * Persistence-only query repository for the current authorization context.
 *
 * Request/session extraction belongs to {@link CaslUserContextResolver}; this
 * repository is intentionally singleton-safe and concerned only with loading
 * authoritative user state from persistence.
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
