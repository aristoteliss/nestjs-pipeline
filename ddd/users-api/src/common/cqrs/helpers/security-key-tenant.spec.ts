/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { sessionUserStore } from '@common/context/session-user.store';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { MissingIdempotencyPartitionError } from '@nestjs-pipeline/idempotency';
import { MissingRateLimitPartitionError } from '@nestjs-pipeline/rate-limit';
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

    const missingTenant = expect.objectContaining({ dimension: 'tenant' });

    for (const invoke of [
      () => createUserIdempotencyKey(user),
      () => createRoleIdempotencyKey(role),
    ]) {
      expect(invoke).toThrow(MissingIdempotencyPartitionError);
      expect(invoke).toThrow(missingTenant);
    }
    for (const invoke of [
      () => createUserRateLimitKey(user),
      () => createAuthRateLimitKey(auth),
    ]) {
      expect(invoke).toThrow(MissingRateLimitPartitionError);
      expect(invoke).toThrow(missingTenant);
    }
  });

  it('keeps identical request identities isolated by tenant', () => {
    const request = new CreateUserCommand({
      username: 'Alice',
      email: 'alice@example.test',
    });
    const tenantA = context(request, 'tenant_a');
    const tenantB = context(request, 'tenant_b');

    // The idempotency key is principal-scoped, so it needs an authenticated one.
    const idempotencyKey = (ctx: IPipelineContext) =>
      sessionUserStore.run(
        { id: 'alice', principalType: 'user', tenant: 'tenant_a' },
        () => createUserIdempotencyKey(ctx),
      );

    expect(idempotencyKey(tenantA)).not.toBe(idempotencyKey(tenantB));
    expect(createUserRateLimitKey(tenantA)).not.toBe(
      createUserRateLimitKey(tenantB),
    );
  });
});
