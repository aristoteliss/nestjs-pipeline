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
  ) {}

  async onModuleInit(): Promise<void> {
    this.orm = await MikroORM.init(createPostgresOrmOptions());
    this.logger.log('MikroORM initialized (postgres schema store)');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.orm) {
      await this.orm.close();
    }
  }

  /**
   * Returns a request-bound or transactional EntityManager if available in the current context,
   * or a newly forked EntityManager instance scoped to the tenant schema.
   *
   * @note Each direct call to this getter without an active RequestContext creates a NEW
   * EntityManager fork with an isolated Unit of Work. For operations requiring a shared
   * Unit of Work or atomic transaction across multiple repositories/queries, use
   * {@link withFork} or {@link transactional}.
   */
  get em(): EntityManager {
    const schema = this.tenantSchemaContext.schema;
    let contextEm: EntityManager | undefined;
    try {
      contextEm = this.orm.em.getContext(false) as EntityManager | undefined;
    } catch {
      contextEm = undefined;
    }

    const isTenantMatch =
      (contextEm as typeof contextEm & { __tenant?: string })?.__tenant ===
        undefined ||
      (contextEm as typeof contextEm & { __tenant?: string })?.__tenant ===
        schema;
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

    if (
      contextEm &&
      contextEm !== this.orm.em &&
      isDriverMatch &&
      isConfigMatch &&
      isSchemaMatch &&
      isTenantMatch
    ) {
      if (
        (contextEm as typeof contextEm & { __tenant?: string }).__tenant ===
        undefined
      ) {
        (contextEm as typeof contextEm & { __tenant?: string }).__tenant =
          schema;
      }
      return contextEm;
    }

    const fork = this.orm.em.fork({
      disableContextResolution: true,
      schema,
    }) as EntityManager;
    (fork as typeof fork & { __tenant?: string }).__tenant = schema;
    return fork;
  }

  get sem(): SqlEntityManager {
    const schema = this.tenantSchemaContext.schema;
    let contextEm: SqlEntityManager | undefined;
    try {
      contextEm = this.orm.em.getContext(false) as SqlEntityManager | undefined;
    } catch {
      contextEm = undefined;
    }

    const isTenantMatch =
      (contextEm as typeof contextEm & { __tenant?: string })?.__tenant ===
        undefined ||
      (contextEm as typeof contextEm & { __tenant?: string })?.__tenant ===
        schema;
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

    if (
      contextEm &&
      contextEm !== this.orm.em &&
      isDriverMatch &&
      isConfigMatch &&
      isSchemaMatch &&
      isTenantMatch
    ) {
      if (
        (contextEm as typeof contextEm & { __tenant?: string }).__tenant ===
        undefined
      ) {
        (contextEm as typeof contextEm & { __tenant?: string }).__tenant =
          schema;
      }
      return contextEm;
    }

    const fork = this.orm.em.fork({
      disableContextResolution: true,
      schema,
    }) as SqlEntityManager;
    (fork as typeof fork & { __tenant?: string }).__tenant = schema;
    return fork;
  }

  /**
   * Executes an operation within an explicit, shared Unit of Work (EntityManager fork).
   * Ensures that all operations within the callback share the same identity map and change set.
   */
  async withFork<T>(cb: (em: EntityManager) => Promise<T>): Promise<T> {
    const schema = this.tenantSchemaContext.schema;
    const fork = this.orm.em.fork({
      disableContextResolution: true,
      schema,
    }) as EntityManager;
    (fork as typeof fork & { __tenant?: string }).__tenant = schema;
    return cb(fork);
  }

  /**
   * Executes an operation within an atomic database transaction using a dedicated fork.
   * Automatically commits on success and rolls back on failure.
   */
  async transactional<T>(cb: (em: EntityManager) => Promise<T>): Promise<T> {
    const schema = this.tenantSchemaContext.schema;
    const fork = this.orm.em.fork({
      disableContextResolution: true,
      schema,
    }) as EntityManager;
    (fork as typeof fork & { __tenant?: string }).__tenant = schema;
    return fork.transactional(cb);
  }
}
