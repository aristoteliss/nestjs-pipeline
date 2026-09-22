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

import { MissingPrincipalContextError } from './idempotent-operation.helper';

function context(request: unknown, tenantId?: string): IPipelineContext {
  return { request, tenantId } as IPipelineContext;
}

describe('security-sensitive pipeline key tenant isolation', () => {
  it('fails closed for every key factory when tenant context is absent', () => {
    const user = context(
      new CreateUserCommand({
        username: 'Alice',
        email: 'alice@example.test',
        idempotencyKey: 'op-1',
      }),
    );
    const role = context(
      new CreateRoleCommand({ name: 'admin', idempotencyKey: 'op-1' }),
    );
    const auth = context(
      new CreateAuthCommand({
        email: 'alice@example.test',
        code: '424242',
        clientIp: '203.0.113.7',
      }),
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
      idempotencyKey: 'op-1',
    });
    const tenantA = context(request, 'tenant_a');
    const tenantB = context(request, 'tenant_b');

    // The idempotency key is principal-scoped, so it needs an authenticated one.
    const idempotencyKey = (ctx: IPipelineContext) =>
      sessionUserStore.run(
        { id: 'alice', principalType: 'user', tenant: 'tenant_a' },
        () => createUserIdempotencyKey(ctx),
      );

    const rateLimitKey = (ctx: IPipelineContext) =>
      sessionUserStore.run(
        { id: 'alice', principalType: 'user', tenant: 'tenant_a' },
        () => createUserRateLimitKey(ctx),
      );

    expect(idempotencyKey(tenantA)).not.toBe(idempotencyKey(tenantB));
    expect(rateLimitKey(tenantA)).not.toBe(rateLimitKey(tenantB));
  });

  it('limits login per source address across claimed emails', () => {
    const login = (email: string, clientIp: string) =>
      createAuthRateLimitKey(
        context(
          new CreateAuthCommand({ email, code: '424242', clientIp }),
          'tenant_a',
        ),
      );

    expect(login('a@example.test', '203.0.113.7')).toBe(
      login('b@example.test', '203.0.113.7'),
    );
    expect(login('a@example.test', '203.0.113.7')).not.toBe(
      login('a@example.test', '198.51.100.9'),
    );
  });

  it('limits user creation per acting principal across target emails', () => {
    const create = (email: string, actor: string) =>
      sessionUserStore.run(
        { id: actor, principalType: 'user', tenant: 'tenant_a' },
        () =>
          createUserRateLimitKey(
            context(
              new CreateUserCommand({ username: 'Alice', email }),
              'tenant_a',
            ),
          ),
      );

    expect(create('a@example.test', 'admin-1')).toBe(
      create('b@example.test', 'admin-1'),
    );
    expect(create('a@example.test', 'admin-1')).not.toBe(
      create('a@example.test', 'admin-2'),
    );
    expect(() =>
      createUserRateLimitKey(
        context(
          new CreateUserCommand({ username: 'Alice', email: 'a@example.test' }),
          'tenant_a',
        ),
      ),
    ).toThrow(MissingPrincipalContextError);
  });
});
