/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { setPersistenceDialect } from '@cqrs-ddd/core/persistence';
import {
  type IEntityManagerSource,
  MikroOrmDialect,
  TenantStore,
} from '@cqrs-ddd/mikro-orm';
import { MikroORM } from '@mikro-orm/core';
import type { SqlEntityManager } from '@mikro-orm/sql';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  createLibsqlOrmOptions,
  createPostgresOrmOptions,
  libsqlDbUrl,
} from './orm-options';
import { persistenceConfig } from './persistence.config';
import { TenantSchemaContext } from './tenant-schema.context';
import { UnknownTenantSchemaError } from './tenant-schema.errors';

/**
 * Injection token of the {@link MikroOrmStore}, which persists every entity of
 * the application (users, roles, capabilities, sessions, cache entries).
 */
export const MIKRO_ORM_CLIENT = Symbol('MIKRO_ORM_CLIENT');

/**
 * The application's MikroORM store: `em` and `transactional()` act on the
 * tenant of `TenantSchemaContext`, through `TenantStore`.
 *
 * libSQL keeps a database per tenant, with one ORM per configured tenant;
 * PostgreSQL keeps a schema per tenant in one database, with one ORM. A tenant
 * outside `persistenceConfig().tenants` is rejected on either engine. It also
 * registers the persistence dialect, read from the entity metadata.
 *
 * @example
 * ```ts
 * constructor(@Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore) {}
 *
 * await this.store.em.findOne(User, { id });
 * ```
 */
@Injectable()
export class MikroOrmStore
  implements IEntityManagerSource, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MikroOrmStore.name);
  private readonly orms = new Map<string, MikroORM>();
  private tenants!: TenantStore<SqlEntityManager>;

  constructor(
    @Inject(TenantSchemaContext)
    private readonly tenantSchemaContext: TenantSchemaContext,
  ) {}

  async onModuleInit(): Promise<void> {
    const config = persistenceConfig();
    const isolation = config.engine === 'postgres' ? 'schema' : 'database';
    const shared =
      isolation === 'schema'
        ? await MikroORM.init(createPostgresOrmOptions())
        : undefined;
    for (const tenant of config.tenants) {
      const orm =
        shared ??
        (await MikroORM.init(
          createLibsqlOrmOptions(libsqlDbUrl(tenant, config)),
        ));
      this.orms.set(tenant, orm);
    }
    this.logger.log(
      `MikroORM initialized: ${config.engine}, a ${isolation} per tenant (${config.tenants.join(', ')})`,
    );
    // Every tenant maps the same entities, so one ORM's metadata serves all.
    const [first] = this.orms.values();
    if (first) setPersistenceDialect(new MikroOrmDialect(first));
    this.tenants = new TenantStore({
      tenant: () => this.tenantSchemaContext.schema,
      orm: (tenant) => {
        const orm = this.orms.get(tenant);
        if (!orm) throw new UnknownTenantSchemaError(tenant);
        return orm;
      },
      isolation,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      [...new Set(this.orms.values())].map((orm) => orm.close()),
    );
    this.orms.clear();
  }

  /**
   * The active tenant's `EntityManager`: the contextual one when it belongs to
   * the tenant, otherwise a new fork. Read it per operation, never keep it.
   *
   * @throws {MissingTenantContextError} Outside a tenant scope.
   * @throws {UnknownTenantSchemaError} For a tenant that is not configured.
   */
  get em(): SqlEntityManager {
    return this.tenants.em;
  }

  /**
   * Runs `work` in a transaction on a fork of its own, for the active tenant;
   * commits when it resolves and rolls back when it rejects.
   *
   * @example
   * ```ts
   * await store.transactional((em) => em.nativeDelete(Auth, { userId }));
   * ```
   */
  transactional<T>(work: (em: SqlEntityManager) => Promise<T>): Promise<T> {
    return this.tenants.transactional(work);
  }
}
