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

import { EntityManager, MikroORM, SqlEntityManager } from '@mikro-orm/libsql';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EntityManagerTenantRegistry } from './entity-manager-tenant.registry';
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
  private readonly entityManagerTenants = new EntityManagerTenantRegistry();
  public orm!: MikroORM;

  constructor(
    @Inject(TenantSchemaContext)
    private readonly tenantSchemaContext: TenantSchemaContext,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const tenant of resolveLibsqlTenants()) {
      const dbName = resolveLibsqlDbUrl(tenant);
      const orm = await MikroORM.init(createLibsqlOrmOptions(dbName));
      this.orms.set(tenant, orm);
      this.logger.log(
        `MikroORM initialized for tenant "${tenant}" (${dbName})`,
      );
    }

    this.orm = this.orms.get(resolveDefaultSchema()) as MikroORM;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(Array.from(this.orms.values()).map((orm) => orm.close()));
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

  private canReuseContextManager(
    contextEm: EntityManager | SqlEntityManager | undefined,
    orm: MikroORM,
    schema: string,
  ): boolean {
    const isTenantMatch = this.entityManagerTenants.matches(contextEm, schema);
    const isSchemaMatch =
      contextEm?.schema === undefined || contextEm.schema === schema;
    const isConfigMatch =
      !orm.config || !contextEm?.config || contextEm.config === orm.config;
    const isDriverMatch =
      !orm.em.getDriver ||
      !contextEm?.getDriver ||
      contextEm.getDriver() === orm.em.getDriver();

    return Boolean(
      contextEm &&
        contextEm !== orm.em &&
        isDriverMatch &&
        isConfigMatch &&
        isSchemaMatch &&
        isTenantMatch,
    );
  }

  private markTenant<T extends EntityManager | SqlEntityManager>(
    manager: T,
    schema: string,
  ): T {
    this.entityManagerTenants.mark(manager, schema);
    return manager;
  }

  /**
   * Returns a request-bound or transactional EntityManager if available in the current context,
   * or a newly forked EntityManager instance.
   *
   * Tenant ownership metadata is tracked externally in a WeakMap; MikroORM
   * EntityManager instances are never monkey-patched with private properties.
   */
  get em(): EntityManager {
    const schema = this.tenantSchemaContext.schema;
    const orm = this.resolveOrm();
    let contextEm: EntityManager | undefined;
    try {
      contextEm = orm.em.getContext(false) as EntityManager | undefined;
    } catch {
      contextEm = undefined;
    }

    if (this.canReuseContextManager(contextEm, orm, schema)) {
      if (this.entityManagerTenants.get(contextEm) === undefined) {
        this.entityManagerTenants.mark(contextEm as EntityManager, schema);
      }
      return contextEm as EntityManager;
    }

    return this.markTenant(
      orm.em.fork({ disableContextResolution: true }) as EntityManager,
      schema,
    );
  }

  get sem(): SqlEntityManager {
    const schema = this.tenantSchemaContext.schema;
    const orm = this.resolveOrm();
    let contextEm: SqlEntityManager | undefined;
    try {
      contextEm = orm.em.getContext(false) as SqlEntityManager | undefined;
    } catch {
      contextEm = undefined;
    }

    if (this.canReuseContextManager(contextEm, orm, schema)) {
      if (this.entityManagerTenants.get(contextEm) === undefined) {
        this.entityManagerTenants.mark(contextEm as SqlEntityManager, schema);
      }
      return contextEm as SqlEntityManager;
    }

    return this.markTenant(
      orm.em.fork({ disableContextResolution: true }) as SqlEntityManager,
      schema,
    );
  }

  /** Executes an operation within an explicit, shared Unit of Work. */
  async withFork<T>(cb: (em: EntityManager) => Promise<T>): Promise<T> {
    const schema = this.tenantSchemaContext.schema;
    const fork = this.markTenant(
      this.resolveOrm().em.fork({ disableContextResolution: true }) as EntityManager,
      schema,
    );
    return cb(fork);
  }

  /** Executes an operation within an atomic database transaction. */
  async transactional<T>(cb: (em: EntityManager) => Promise<T>): Promise<T> {
    const schema = this.tenantSchemaContext.schema;
    const fork = this.markTenant(
      this.resolveOrm().em.fork({ disableContextResolution: true }) as EntityManager,
      schema,
    );
    return fork.transactional(cb);
  }
}
