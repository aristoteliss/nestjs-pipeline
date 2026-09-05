import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { createRoleIdempotencyKey } from '../../../roles/cqrs/commands/create-role.handler';
import { createUserIdempotencyKey } from '../../../users/cqrs/commands/create-user.handler';

describe('create idempotency security scope', () => {
  it.each([
    [createUserIdempotencyKey, { email: 'same@example.test' }, 'user.create'],
    [createRoleIdempotencyKey, { name: 'same-role' }, 'role.create'],
  ] as const)(
    'partitions %s by tenant and principal',
    (factory, payload, kind) => {
      const key = (tenant: string, principal: string) =>
        factory({
          tenantId: tenant,
          request: { ...payload, sessionUser: { id: principal } },
        } as unknown as IPipelineContext);

      expect(key('tenant_a', 'alice')).toContain(`tenant_a:alice:${kind}:`);
      expect(key('tenant_a', 'alice')).not.toBe(key('tenant_a', 'bob'));
      expect(key('tenant_a', 'alice')).not.toBe(key('tenant_b', 'alice'));

      const defaultCtxKey = factory({
        request: { ...payload, sessionUser: { id: 'alice' } },
      } as unknown as IPipelineContext);
      expect(defaultCtxKey).toContain(`default:alice:${kind}:`);
    },
  );
});
