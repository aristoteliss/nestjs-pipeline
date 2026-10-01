/* Copyright (C) 2026-present Aristotelis — see repository license. */

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { bootstrapE2E } from './support/e2e-app';

const admin = JSON.stringify({
  id: 'admin-tenant-settings',
  email: 'admin@acme.test',
  department: 'platform',
  grants: ['all|manage|*'],
});

describe('tenant settings of a second application in the same process (e2e)', () => {
  it('serves the tenants of the application that is starting, not those of an earlier one', async () => {
    const first = await bootstrapE2E({ tenants: ['tenant_a'] });
    await first.close();

    const second = await bootstrapE2E({ tenants: ['tenant_b'] });
    try {
      const res = await request(second.app.getHttpServer())
        .get('/users')
        .set('x-tenant-schema', 'tenant_b')
        .set('x-test-user', admin);

      expect(res.status).toBe(200);
    } finally {
      await second.close();
    }
  }, 180_000);
});
