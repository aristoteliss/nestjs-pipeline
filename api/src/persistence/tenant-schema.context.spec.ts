/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MissingTenantContextError } from '@cqrs-ddd/core/domain';
import { currentTenantId, runWithTenant } from '@cqrs-ddd/pipeline-tenant';
import { describe, expect, it } from 'vitest';
import { TenantSchemaContext } from './tenant-schema.context.js';
import { InvalidTenantSchemaError } from './tenant-schema.errors.js';

describe('TenantSchemaContext', () => {
  it('exposes the tenant of the enclosing run, across async turns', async () => {
    const context = new TenantSchemaContext();

    await context.run(' tenant_a ', async () => {
      await Promise.resolve();
      expect(context.schema).toBe('tenant_a');
    });
  });

  it('gives a nested run its own tenant and restores the outer one', () => {
    const context = new TenantSchemaContext();

    context.run('tenant_a', () => {
      context.run('tenant_b', () => expect(context.schema).toBe('tenant_b'));
      expect(context.schema).toBe('tenant_a');
    });
  });

  it('fails closed outside a run instead of falling back to a default tenant', () => {
    const context = new TenantSchemaContext();

    expect(() => context.schema).toThrow(MissingTenantContextError);
  });

  it('refuses to run without a tenant', () => {
    const context = new TenantSchemaContext();
    let ran = false;

    expect(() =>
      context.run(undefined, () => {
        ran = true;
      }),
    ).toThrow(MissingTenantContextError);
    expect(ran).toBe(false);
  });

  it('refuses an invalid tenant name', () => {
    expect(() => new TenantSchemaContext().run('tenant-a', () => 0)).toThrow(
      InvalidTenantSchemaError,
    );
  });

  it('shares one tenant with the pipeline tenant scope, in both directions', () => {
    const context = new TenantSchemaContext();

    context.run('tenant_a', () => expect(currentTenantId()).toBe('tenant_a'));
    runWithTenant('tenant_b', () => {
      expect(context.schema).toBe('tenant_b');
    });
  });

  it('refuses an invalid tenant set through the shared scope', () => {
    const context = new TenantSchemaContext();

    runWithTenant('tenant-a', () =>
      expect(() => context.schema).toThrow(InvalidTenantSchemaError),
    );
  });
});
