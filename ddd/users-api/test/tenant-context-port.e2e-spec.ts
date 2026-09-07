import {
  type ITenantContext,
  TENANT_CONTEXT,
} from '../src/common/context/tenant-context.port';
import { TenantSchemaContext } from '../src/persistence/tenant-schema.context';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/** E2E regression coverage for Architecture.md finding #3. */
describe('tenant context application port (e2e)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await bootstrapE2E({ tenants: ['tenant_port_test'] });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('binds TENANT_CONTEXT to the same execution context used by persistence', () => {
    const port = ctx.app.get<ITenantContext>(TENANT_CONTEXT);
    const concrete = ctx.app.get(TenantSchemaContext);

    expect(port).toBe(concrete);
    concrete.run('tenant_port_test', () => {
      expect(port.schema).toBe('tenant_port_test');
    });
  });
});
