/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { filterCacheKey } from '@common/cqrs/helpers/filterCacheKey.helper';
import { Inject, Injectable } from '@nestjs/common';
import {
  AcknowledgePersisted,
  Cache,
  ICache,
  MapPersistenceErrors,
  optimisticUpdate,
} from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { MikroOrmWriteSideCommandRepository } from '@persistence/mikro-orm-write-side.command-repository';
import { UniqueRoleNameException } from '../domain/models/errors/role-name.exception';
import { Role, RoleSnapshot } from '../domain/models/role.entity';

@Injectable()
export class UpdateRoleCommandRepository extends MikroOrmWriteSideCommandRepository<
  RoleSnapshot,
  Role,
  RoleSnapshot
> {
  constructor(
    @Inject(CACHE_TOKEN) cache: ICache<RoleSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) store: MikroOrmStore,
  ) {
    super(cache, store, Role, Role.aggregateName, Role.fromJSON);
  }

  @Cache<Role, RoleSnapshot>((role) =>
    filterCacheKey(Role.aggregateName, { id: role.id }),
  )
  @AcknowledgePersisted<[Role]>({ entity: ([role]) => role })
  @MapPersistenceErrors<[Role], Role>({
    entity: ([role]) => role,
    unique: [
      {
        constraint: 'roles_name_unique',
        columns: 'roles.name',
        error: (role) => new UniqueRoleNameException(role),
      },
    ],
  })
  async save(role: Role): Promise<RoleSnapshot> {
    const snapshot = role.toJSON();
    await optimisticUpdate(
      this.store.em,
      Role,
      role,
      {
        name: snapshot.name,
        updatedAt: snapshot.updatedAt,
      },
      'Role',
    );
    return snapshot;
  }
}
