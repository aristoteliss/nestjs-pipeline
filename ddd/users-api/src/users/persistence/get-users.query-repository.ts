/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core/application';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { GetUsersQuery } from '../cqrs/queries/get-users.query';
import { User } from '../domain/models/user.entity';

@Injectable()
export class GetUsersQueryRepository
  implements IQueryRepository<GetUsersQuery, User[]>
{
  constructor(
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {}

  async find(_query: GetUsersQuery): Promise<User[]> {
    return this.store.em.findAll(User);
  }
}
