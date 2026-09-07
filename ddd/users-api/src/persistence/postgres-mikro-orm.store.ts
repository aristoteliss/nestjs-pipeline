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
import { EntityManager, SqlEntityManager } from '@mikro-orm/postgresql';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EntityManagerTenantRegistry } from './entity-manager-tenant.registry';
import { createPostgresOrmOptions } from './postgres-options';
import { TenantSchemaContext } from './tenant-schema.context';

@Injectable()
/**
 * PostgreSQL MikroORM store that scopes EntityManager forks to the active
 * tenant schema from TenantSchemaContext without mutating MikroORM internals.
 */
export class PostgresMikroOrmStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostgresMikroOrmStore.name);
  private readonly entityManagerTenants = new EntityManagerTenantRegistry();
  public orm!: MikroORM;

  constructor(
    @Inject(TenantSchemaContext)
    private readonly tenantSchemaContext: TenantSchemaContext,
  ) {}

  async onModuleInit(): Promise<void> {
    this.orm = await MikroORM.init(createPostgresOrmOptions());
    this.logger.log('MikroORM initialized (postgres schema store)');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.orm) await this.orm.close();
  }

  private canReuseContextManager(
    contextEm: EntityManager | SqlEntityManager | undefined,
    schema: string,
  ): boolean {
    const isTenantMatch = this.entityManagerTenants.matches(contextEm, schema);
    const isSchemaMatch =
      contextEm?.schema === undefined || contextEm.schema === schema;
    const isConfigMatch =
      !this.orm.config ||
      !contextEm?.config ||
      contextEm.config === this.orm.config;
    const isDriverMatch =
      !this.orm.em.getDriver ||
      !contextEm?.getDriver ||
      contextEm.getDriver() === this.orm.em.getDriver();

    return Boolean(
      contextEm &&
        contextEm !== this.orm.em &&
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

  get em(): EntityManager {
    const schema = this.tenantSchemaContext.schema;
    let contextEm: EntityManager | undefined;
    try {
      contextEm = this.orm.em.getContext(false) as EntityManager | undefined;
    } catch {
      contextEm = undefined;
    }

    if (this.canReuseContextManager(contextEm, schema)) {
      if (this.entityManagerTenants.get(contextEm) === undefined) {
        this.entityManagerTenants.mark(contextEm as EntityManager, schema);
      }
      return contextEm as EntityManager;
    }

    return this.markTenant(
      this.orm.em.fork({ disableContextResolution: true, schema }) as EntityManager,
      schema,
    );
  }

  get sem(): SqlEntityManager {
    const schema = this.tenantSchemaContext.schema;
    let contextEm: SqlEntityManager | undefined;
    try {
      contextEm = this.orm.em.getContext(false) as SqlEntityManager | undefined;
    } catch {
      contextEm = undefined;
    }

    if (this.canReuseContextManager(contextEm, schema)) {
      if (this.entityManagerTenants.get(contextEm) === undefined) {
        this.entityManagerTenants.mark(contextEm as SqlEntityManager, schema);
      }
      return contextEm as SqlEntityManager;
    }

    return this.markTenant(
      this.orm.em.fork({ disableContextResolution: true, schema }) as SqlEntityManager,
      schema,
    );
  }

  async withFork<T>(cb: (em: EntityManager) => Promise<T>): Promise<T> {
    const schema = this.tenantSchemaContext.schema;
    const fork = this.markTenant(
      this.orm.em.fork({ disableContextResolution: true, schema }) as EntityManager,
      schema,
    );
    return cb(fork);
  }

  async transactional<T>(cb: (em: EntityManager) => Promise<T>): Promise<T> {
    const schema = this.tenantSchemaContext.schema;
    const fork = this.markTenant(
      this.orm.em.fork({ disableContextResolution: true, schema }) as EntityManager,
      schema,
    );
    return fork.transactional(cb);
  }
}
