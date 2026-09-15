/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core';
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

  async find(_query: GetRolesQuery): Promise<Role[]> {
    return await this.store.em.find(Role, {});
  }
}
