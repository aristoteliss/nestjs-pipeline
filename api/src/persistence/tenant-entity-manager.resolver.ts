/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntityManagerTenantRegistry } from './entity-manager-tenant.registry';

/** The parts of a MikroORM EntityManager that decide whether it may be reused. */
interface CandidateManager {
  readonly schema?: string;
  readonly config?: unknown;
  getDriver?(): unknown;
}

/** The ORM instance that owns the tenant's database or schema. */
interface TenantOrm {
  readonly config?: unknown;
  readonly em: CandidateManager & { getContext(validate: boolean): unknown };
}

/**
 * Chooses the EntityManager a store hands out for the active tenant.
 *
 * A contextual manager (request context or active transaction) is reused only
 * when it belongs to the tenant's ORM instance, configuration, driver and
 * schema and is not already registered to another tenant. Anything else gets
 * a fresh fork from the caller-supplied factory. Every returned manager is
 * registered to the tenant so a later request for another tenant cannot reuse
 * it.
 */
export class TenantEntityManagerResolver {
  private readonly tenants = new EntityManagerTenantRegistry();

  resolve<TManager extends object>(
    orm: TenantOrm,
    tenant: string,
    fork: () => TManager,
  ): TManager {
    const context = this.contextManager(orm);
    if (context && this.canReuse(context, orm, tenant)) {
      if (this.tenants.get(context) === undefined) {
        this.tenants.mark(context, tenant);
      }
      return context as TManager;
    }
    return this.fork(tenant, fork);
  }

  fork<TManager extends object>(
    tenant: string,
    fork: () => TManager,
  ): TManager {
    const manager = fork();
    this.tenants.mark(manager, tenant);
    return manager;
  }

  private contextManager(orm: TenantOrm): CandidateManager | undefined {
    try {
      return orm.em.getContext(false) as CandidateManager | undefined;
    } catch {
      return undefined;
    }
  }

  private canReuse(
    context: CandidateManager,
    orm: TenantOrm,
    tenant: string,
  ): boolean {
    const isGlobalManager = context === orm.em;
    const isTenantMatch = this.tenants.matches(context, tenant);
    const isSchemaMatch =
      context.schema === undefined || context.schema === tenant;
    const isConfigMatch =
      !orm.config || !context.config || context.config === orm.config;
    const isDriverMatch =
      !orm.em.getDriver ||
      !context.getDriver ||
      context.getDriver() === orm.em.getDriver();

    return (
      !isGlobalManager &&
      isTenantMatch &&
      isSchemaMatch &&
      isConfigMatch &&
      isDriverMatch
    );
  }
}
