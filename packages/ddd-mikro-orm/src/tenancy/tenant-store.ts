/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { EntityManager, MikroORM } from '@mikro-orm/core';
import type { IEntityManagerSource } from '../interfaces/entity-manager-source.js';

/**
 * How tenants are kept apart: `'database'` — one ORM per tenant, each on its own
 * database; `'schema'` — one ORM, each tenant a schema of its database.
 */
export type TenantIsolation = 'database' | 'schema';

/** Options of {@link TenantStore}. */
export interface TenantStoreOptions {
  /** The active tenant. Throw when there is none: the store never picks one. */
  tenant(): string;
  /** The initialized ORM that owns `tenant`'s data. Throw for an unknown tenant. */
  orm(tenant: string): MikroORM;
  isolation: TenantIsolation;
}

/**
 * The `EntityManager` source of a multi-tenant application: `em` and
 * `transactional()` always act on the active tenant's database or schema, for
 * `AggregateRepository`, `MikroOrmCache` and the application's own repositories.
 *
 * `em` reuses a contextual manager (a MikroORM `RequestContext` or an active
 * transaction) only when it belongs to the tenant's ORM, configuration, driver
 * and schema and no other tenant claimed it first; otherwise it forks one.
 * `transactional()` always runs on a fresh fork. Every manager it hands out is
 * recorded to its tenant outside the manager (a `WeakMap`), so a later request
 * for another tenant cannot reuse it; MikroORM objects are never modified.
 *
 * @example
 * ```ts
 * const store = new TenantStore({
 *   tenant: () => currentTenantId() ?? fail(),
 *   orm: (tenant) => orms.get(tenant) ?? fail(),
 *   isolation: 'database',
 * });
 * const repository = new UpdateUserRepository(cache, store);
 * ```
 */
export class TenantStore<TManager extends EntityManager = EntityManager>
  implements IEntityManagerSource
{
  private readonly owners = new WeakMap<object, string>();

  constructor(private readonly options: TenantStoreOptions) {}

  /**
   * The active tenant's manager: its contextual one when that may be reused,
   * otherwise a new fork. Read it per operation, never keep it.
   *
   * @throws What `options.tenant` or `options.orm` throws.
   */
  get em(): TManager {
    const tenant = this.options.tenant();
    const orm = this.options.orm(tenant);
    const context = contextOf(orm);
    if (context && this.canReuse(context, orm, tenant)) {
      if (!this.owners.has(context)) this.owners.set(context, tenant);
      return context as TManager;
    }
    return this.fork(orm, tenant);
  }

  /**
   * Runs `work` in a transaction on a fork dedicated to this call, for the
   * active tenant; commits when it resolves and rolls back when it rejects.
   * What `options.tenant` or `options.orm` throws becomes its rejection.
   *
   * @example
   * ```ts
   * await store.transactional((em) => em.nativeDelete(CacheEntry, { key }));
   * ```
   */
  async transactional<T>(work: (em: TManager) => Promise<T>): Promise<T> {
    const tenant = this.options.tenant();
    const fork = this.fork(this.options.orm(tenant), tenant);
    return fork.transactional((em) => work(em as TManager));
  }

  private fork(orm: MikroORM, tenant: string): TManager {
    const em = orm.em.fork({
      disableContextResolution: true,
      ...(this.options.isolation === 'schema' ? { schema: tenant } : {}),
    }) as TManager;
    this.owners.set(em, tenant);
    return em;
  }

  private canReuse(
    context: EntityManager,
    orm: MikroORM,
    tenant: string,
  ): boolean {
    const owner = this.owners.get(context);
    return (
      context !== orm.em &&
      (owner === undefined || owner === tenant) &&
      (context.schema === undefined || context.schema === tenant) &&
      context.config === orm.config &&
      context.getDriver() === orm.em.getDriver()
    );
  }
}

function contextOf(orm: MikroORM): EntityManager | undefined {
  try {
    return orm.em.getContext(false);
  } catch {
    return undefined;
  }
}
