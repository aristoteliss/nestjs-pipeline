/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MikroORM } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createPostgresOrmOptions } from './postgres-options';
import { TenantEntityManagerResolver } from './tenant-entity-manager.resolver';
import { TenantSchemaContext } from './tenant-schema.context';

@Injectable()
/**
 * PostgreSQL MikroORM store that scopes EntityManager forks to the active
 * tenant schema from TenantSchemaContext.
 */
export class PostgresMikroOrmStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostgresMikroOrmStore.name);
  private readonly entityManagers = new TenantEntityManagerResolver();
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

  private forkFor(schema: string): EntityManager {
    return this.orm.em.fork({
      disableContextResolution: true,
      schema,
    }) as EntityManager;
  }

  /**
   * Returns a request-bound or transactional EntityManager if available in the current context,
   * or a newly forked EntityManager instance scoped to the tenant schema.
   *
   * Tenant ownership metadata is tracked externally in a WeakMap; MikroORM
   * EntityManager instances are never monkey-patched with private properties.
   */
  get em(): EntityManager {
    const schema = this.tenantSchemaContext.schema;
    return this.entityManagers.resolve(this.orm, schema, () =>
      this.forkFor(schema),
    );
  }

  /**
   * Executes an operation within an atomic database transaction using a dedicated fork.
   * Automatically commits on success and rolls back on failure.
   */
  async transactional<T>(cb: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.dedicatedFork().transactional(cb);
  }

  private dedicatedFork(): EntityManager {
    const schema = this.tenantSchemaContext.schema;
    return this.entityManagers.fork(schema, () => this.forkFor(schema));
  }
}
