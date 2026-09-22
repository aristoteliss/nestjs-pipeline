/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntityManager, MikroORM, SqlEntityManager } from '@mikro-orm/libsql';
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
import { TenantEntityManagerResolver } from './tenant-entity-manager.resolver';
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

  private readonly entityManagers = new TenantEntityManagerResolver();

  private forkFor(orm: MikroORM): EntityManager {
    return orm.em.fork({ disableContextResolution: true });
  }

  /**
   * Returns a request-bound or transactional EntityManager if available in the current context,
   * or a newly forked EntityManager instance.
   *
   * Tenant ownership metadata is tracked externally in a WeakMap; MikroORM
   * EntityManager instances are never monkey-patched with private properties.
   */
  get em(): EntityManager {
    const orm = this.resolveOrm();
    return this.entityManagers.resolve(
      orm,
      this.tenantSchemaContext.schema,
      () => this.forkFor(orm),
    );
  }

  get sem(): SqlEntityManager {
    return this.em;
  }

  /**
   * Executes an operation within an explicit, shared Unit of Work (EntityManager fork).
   * Ensures that all operations within the callback share the same identity map and change set.
   */
  async withFork<T>(cb: (em: EntityManager) => Promise<T>): Promise<T> {
    return cb(this.dedicatedFork());
  }

  /**
   * Executes an operation within an atomic database transaction using a dedicated fork.
   * Automatically commits on success and rolls back on failure.
   */
  async transactional<T>(cb: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.dedicatedFork().transactional(cb);
  }

  private dedicatedFork(): EntityManager {
    const orm = this.resolveOrm();
    return this.entityManagers.fork(this.tenantSchemaContext.schema, () =>
      this.forkFor(orm),
    );
  }
}
