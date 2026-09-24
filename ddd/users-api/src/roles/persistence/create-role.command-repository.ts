/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import { ICache } from '@nestjs-pipeline/ddd-core/application';
import {
  assertAutocommit,
  CACHE_TOKEN,
  CommandRepository,
  filterCacheKey,
  PersistedWrite,
} from '@nestjs-pipeline/ddd-core/persistence';
import { cacheWriteLogger } from '@persistence/cache/cache-loggers';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { UniqueRoleNameException } from '../domain/models/errors/role-name.exception';
import { Role, RoleSnapshot } from '../domain/models/role.entity';

@Injectable()
export class CreateRoleCommandRepository extends CommandRepository<
  Role,
  RoleSnapshot
> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<RoleSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  @PersistedWrite<Role>({
    cache: {
      logger: cacheWriteLogger,
      setKey: (role) => filterCacheKey(Role.aggregateName, { id: role.id }),
      invalidateKeys: (role) => [
        filterCacheKey(Role.aggregateName, { name: role.name }),
      ],
    },
    unique: [
      {
        constraint: 'roles_name_unique',
        columns: 'roles.name',
        error: (role) => new UniqueRoleNameException(role),
      },
    ],
  })
  async save(role: Role): Promise<RoleSnapshot> {
    const em = this.store.em;
    assertAutocommit(em, 'createRole');
    const persisted = await em.upsert(Role, role);
    return persisted.toJSON();
  }
}
