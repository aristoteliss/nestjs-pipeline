/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Associates MikroORM EntityManager instances with the tenant selected when the
 * manager/fork was created without mutating third-party runtime objects.
 *
 * A WeakMap keeps the metadata lifecycle tied to the EntityManager instance and
 * avoids the previous private `__tenant` monkey-patch.
 */
export class EntityManagerTenantRegistry {
  private readonly tenants = new WeakMap<object, string>();

  mark(manager: object, tenant: string): void {
    this.tenants.set(manager, tenant);
  }

  get(manager: object | undefined): string | undefined {
    return manager ? this.tenants.get(manager) : undefined;
  }

  matches(manager: object | undefined, tenant: string): boolean {
    const registered = this.get(manager);
    return registered === undefined || registered === tenant;
  }
}
