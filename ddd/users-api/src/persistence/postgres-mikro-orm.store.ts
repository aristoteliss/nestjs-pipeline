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

import { MikroORM } from '@mikro-orm/core';
import {
  EntityManager,
  SqlEntityManager,
} from '@mikro-orm/postgresql';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createPostgresOrmOptions } from './postgres-options';
import { TenantSchemaContext } from './tenant-schema.context';

@Injectable()
/**
 * PostgreSQL MikroORM store that scopes EntityManager forks to the active
 * tenant schema from TenantSchemaContext.
 */
export class PostgresMikroOrmStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostgresMikroOrmStore.name);
  public orm!: MikroORM;

  constructor(
    @Inject(TenantSchemaContext)
    private readonly tenantSchemaContext: TenantSchemaContext,
  ) { }

  async onModuleInit(): Promise<void> {
    this.orm = await MikroORM.init(createPostgresOrmOptions());
    this.logger.log('MikroORM initialized (postgres schema store)');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.orm) {
      await this.orm.close();
    }
  }

  get em(): EntityManager {
    return this.orm.em.fork({
      schema: this.tenantSchemaContext.schema,
    }) as EntityManager;
  }

  get sem(): SqlEntityManager {
    return this.orm.em.fork({
      schema: this.tenantSchemaContext.schema,
    }) as SqlEntityManager;
  }
}
