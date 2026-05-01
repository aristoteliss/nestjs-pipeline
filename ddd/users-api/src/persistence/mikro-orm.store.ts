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

import { EntityManager } from '@mikro-orm/core';
import { LibSqlDriver, MikroORM, SqlEntityManager } from '@mikro-orm/libsql';
import { Migrator } from '@mikro-orm/migrations';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AuthSchema } from './schemas/auth.schema';
import { CacheSchema } from './schemas/cache.schema';
import { CapabilitySchema } from './schemas/capability.schema';
import { RoleSchema } from './schemas/role.schema';
import { RoleCapabilitySchema } from './schemas/role-capability.schema';
import { UserSchema } from './schemas/user.schema';
import { UserAdditionalCapabilitySchema } from './schemas/user-additional-capability.schema';
import { UserDeniedCapabilitySchema } from './schemas/user-denied-capability.schema';
import { UserRoleSchema } from './schemas/user-role.schema';

/**
 * MikroOrmStore is the PRIMARY persistence layer for the application.
 * It manages all entities (users, roles, capabilities, cache, etc.) using MikroORM.
 */
export const MIKRO_ORM_CLIENT = Symbol('MIKRO_ORM_CLIENT');

@Injectable()
export class MikroOrmStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MikroOrmStore.name);
  public orm!: MikroORM;

  async onModuleInit(): Promise<void> {
    this.orm = await MikroORM.init({
      driver: LibSqlDriver,
      dbName: process.env.DATABASE_URL ?? 'file:local.db',
      password: process.env.AUTH_TOKEN,
      entities: [
        UserSchema,
        AuthSchema,
        RoleSchema,
        CapabilitySchema,
        RoleCapabilitySchema,
        UserRoleSchema,
        UserAdditionalCapabilitySchema,
        UserDeniedCapabilitySchema,
        CacheSchema,
      ],
      extensions: [Migrator],
      migrations: {
        path: 'dist/persistence/migrations',
        pathTs: 'src/persistence/migrations',
        glob: '!(*.d).{js,ts}',
      },
      debug: process.env.NODE_ENV !== 'production',
    });

    this.logger.log('MikroORM initialized (primary store)');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.orm) {
      await this.orm.close();
    }
  }

  get em(): EntityManager | SqlEntityManager {
    return this.orm.em.fork();
  }
}
