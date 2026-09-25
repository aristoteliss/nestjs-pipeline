/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IQueryRepository } from '@cqrs-ddd/core/application';
import { Inject, Injectable } from '@nestjs/common';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { GetRolesQuery } from '../cqrs/queries/get-roles.query';
import { Role } from '../domain/models/role.entity';

@Injectable()
export class GetRolesQueryRepository
  implements IQueryRepository<GetRolesQuery, Role[]>
{
  constructor(
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {}

  async find(query: GetRolesQuery): Promise<Role[]> {
    const where =
      query.names !== undefined ? { name: { $in: query.names } } : {};
    return await this.store.em.find(Role, where);
  }
}
