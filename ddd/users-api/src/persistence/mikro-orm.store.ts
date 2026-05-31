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

import { MikroORM } from '@mikro-orm/libsql';
import { EntityManager, SqlEntityManager } from '@mikro-orm/sqlite';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  createLibsqlOrmOptions,
  resolveDefaultSchema,
  resolveLibsqlDbUrl,
  resolveLibsqlTenants,
} from './libsql-options';
import { TenantSchemaContext } from './tenant-schema.context';

/**
 * MikroOrmStore is the PRIMARY persistence layer for the application.
 * It manages all entities (users, roles, capabilities, cache, etc.) using MikroORM.
 *
 * For SQLite/libSQL, multi-tenancy uses a database-per-tenant strategy: one ORM
 * instance is initialized per tenant schema (resolved from `SQLITE_TENANTS`), and
 * the active tenant from `TenantSchemaContext` selects which database to query.
 */
export const MIKRO_ORM_CLIENT = Symbol('MIKRO_ORM_CLIENT');

@Injectable()
export class MikroOrmStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MikroOrmStore.name);
  private readonly orms = new Map<string, MikroORM>();
  public orm!: MikroORM;

  constructor(
    @Inject(TenantSchemaContext)
    private readonly tenantSchemaContext: TenantSchemaContext,
  ) { }

  async onModuleInit(): Promise<void> {
    for (const tenant of resolveLibsqlTenants()) {
      const dbName = resolveLibsqlDbUrl(tenant);
      const orm = await MikroORM.init(createLibsqlOrmOptions(dbName));
      this.orms.set(tenant, orm);
      this.logger.log(`MikroORM initialized for tenant "${tenant}" (${dbName})`);
    }

    this.orm = this.orms.get(resolveDefaultSchema()) as MikroORM;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      Array.from(this.orms.values()).map((orm) => orm.close()),
    );
    this.orms.clear();
  }

  private resolveOrm(): MikroORM {
    const schema = this.tenantSchemaContext.schema;
    const orm = this.orms.get(schema);
    if (!orm) {
      throw new BadRequestException(`Unknown tenant schema: ${schema}`);
    }

    return orm;
  }

  get em(): EntityManager {
    return this.resolveOrm().em.fork() as EntityManager;
  }

  get sem(): SqlEntityManager {
    return this.resolveOrm().em.fork() as SqlEntityManager;
  }
}
