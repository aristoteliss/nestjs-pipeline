/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { filterCacheKey } from '@common/cqrs/helpers/filterCacheKey.helper';
import {
  OptimisticLockError,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import {
  Cache,
  CommandRepository,
  EntityNotFoundException,
  ICache,
  IWriteSideAggregateRepository,
} from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { UniqueRoleNameException } from '../domain/models/errors/role-name.exception';
import { Role, RoleSnapshot } from '../domain/models/role.entity';

@Injectable()
export class UpdateRoleCommandRepository
  extends CommandRepository<Role, RoleSnapshot>
  implements IWriteSideAggregateRepository<Role, RoleSnapshot, RoleSnapshot>
{
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<RoleSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  /** Reads directly from primary persistence; command hydration never uses read-side cache. */
  async findById(id: string): Promise<RoleSnapshot | null> {
    const role = await this.store.em.findOne(Role, { id }, { refresh: true });
    return role?.toJSON() ?? null;
  }

  @Cache<Role, RoleSnapshot>((role) =>
    filterCacheKey(Role.aggregateName, { id: role.id }),
  )
  async save(role: Role): Promise<RoleSnapshot> {
    try {
      const affected = await this.store.em.nativeUpdate(
        Role,
        { id: role.id, version: role.getExpectedVersion() },
        {
          name: role.name,
          updatedAt: role.updatedAt,
          version: role.version,
        },
      );
      if (affected === 0) {
        const exists = await this.store.em.findOne(
          Role,
          { id: role.id },
          { refresh: true },
        );
        if (exists) {
          throw OptimisticLockError.lockFailedVersionMismatch(
            role,
            role.getExpectedVersion(),
            exists.version,
          );
        }
        throw new EntityNotFoundException('Role', role.id);
      }
      return role.toJSON();
    } catch (err: unknown) {
      if (
        err instanceof UniqueConstraintViolationException ||
        (typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          err.code === 'SQLITE_CONSTRAINT_UNIQUE') ||
        (err instanceof Error &&
          (err.message.includes('UNIQUE') ||
            err.message.includes('unique') ||
            err.message.includes('SQLITE_CONSTRAINT_UNIQUE')))
      ) {
        throw new UniqueRoleNameException(role);
      }
      throw err;
    }
  }
}
