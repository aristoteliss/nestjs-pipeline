import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { CreateAuthCommand } from '../../../auths/cqrs/commands/create-auth.command';
import { createAuthRateLimitKey } from '../../../auths/cqrs/commands/create-auth.handler';
import { CreateRoleCommand } from '../../../roles/cqrs/commands/create-role.command';
import { createRoleIdempotencyKey } from '../../../roles/cqrs/commands/create-role.handler';
import { CreateUserCommand } from '../../../users/cqrs/commands/create-user.command';
import {
  createUserIdempotencyKey,
  createUserRateLimitKey,
} from '../../../users/cqrs/commands/create-user.handler';
import { MissingTenantContextError } from './requireTenantId.helper';

function context(request: unknown, tenantId?: string): IPipelineContext {
  return { request, tenantId } as IPipelineContext;
}

describe('security-sensitive pipeline key tenant isolation', () => {
  it('fails closed for every key factory when tenant context is absent', () => {
    const user = context(
      new CreateUserCommand({ username: 'Alice', email: 'alice@example.test' }),
    );
    const role = context(new CreateRoleCommand({ name: 'admin' }));
    const auth = context(
      new CreateAuthCommand({ email: 'alice@example.test', code: '424242' }),
    );

    for (const invoke of [
      () => createUserIdempotencyKey(user),
      () => createUserRateLimitKey(user),
      () => createRoleIdempotencyKey(role),
      () => createAuthRateLimitKey(auth),
    ]) {
      expect(invoke).toThrow(MissingTenantContextError);
    }
  });

  it('keeps identical request identities isolated by tenant', () => {
    const request = new CreateUserCommand({
      username: 'Alice',
      email: 'alice@example.test',
    });
    const tenantA = context(request, 'tenant_a');
    const tenantB = context(request, 'tenant_b');

    expect(createUserIdempotencyKey(tenantA)).not.toBe(
      createUserIdempotencyKey(tenantB),
    );
    expect(createUserRateLimitKey(tenantA)).not.toBe(
      createUserRateLimitKey(tenantB),
    );
  });
});
