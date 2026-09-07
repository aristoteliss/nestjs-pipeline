import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIKRO_ORM_CLIENT, type MikroOrmStore } from '../src/persistence/mikro-orm.store';
import { TenantSchemaContext } from '../src/persistence/tenant-schema.context';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

describe('tenant EntityManager metadata (e2e)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await bootstrapE2E({ tenants: ['tenant_a', 'tenant_b'] });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('selects isolated tenant managers without monkey-patching MikroORM objects', async () => {
    const store = ctx.app.get<MikroOrmStore>(MIKRO_ORM_CLIENT);
    const tenantContext = ctx.app.get(TenantSchemaContext);

    const managerA = await tenantContext.run('tenant_a', async () => store.em);
    const managerB = await tenantContext.run('tenant_b', async () => store.em);

    expect(managerA).not.toBe(managerB);
    expect((managerA as any).__tenant).toBeUndefined();
    expect((managerB as any).__tenant).toBeUndefined();
  });
});
