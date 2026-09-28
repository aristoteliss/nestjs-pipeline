/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { sessionPrincipalStore } from '@common/context/session-principal.store';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import {
  IdempotencyBehavior,
  type IdempotencyBehaviorOptions,
  type IdempotencyKeyFactory,
  MissingIdempotencyPartitionError,
} from '@nestjs-pipeline/idempotency';
import {
  MissingRateLimitPartitionError,
  RateLimitBehavior,
  type RateLimitBehaviorOptions,
  type RateLimitKeyFactory,
} from '@nestjs-pipeline/rate-limit';
import { describe, expect, it } from 'vitest';
import { CreateAuthCommand } from '../src/auths/application/cqrs/commands/create-auth.command';
import { CreateAuthHandler } from '../src/auths/application/cqrs/commands/create-auth.handler';
import { RevokeAuthCommand } from '../src/auths/application/cqrs/commands/revoke-auth.command';
import { RevokeAuthHandler } from '../src/auths/application/cqrs/commands/revoke-auth.handler';
import { CreateRoleCommand } from '../src/roles/application/cqrs/commands/create-role.command';
import { CreateRoleHandler } from '../src/roles/application/cqrs/commands/create-role.handler';
import { CreateUserCommand } from '../src/users/application/cqrs/commands/create-user.command';
import { CreateUserHandler } from '../src/users/application/cqrs/commands/create-user.handler';
import { declaredOptions } from './support/declared-options';

function context(request: unknown, tenantId?: string): IPipelineContext {
  return { request, tenantId } as IPipelineContext;
}

const rateLimitKeyOf = (
  handler: Parameters<typeof declaredOptions>[0],
): RateLimitKeyFactory =>
  declaredOptions<Required<RateLimitBehaviorOptions>>(
    handler,
    RateLimitBehavior,
  ).keyFactory;

const idempotencyKeyOf = (
  handler: Parameters<typeof declaredOptions>[0],
): IdempotencyKeyFactory =>
  declaredOptions<Required<IdempotencyBehaviorOptions>>(
    handler,
    IdempotencyBehavior,
  ).keyFactory;

const createAuthRateLimitKey = rateLimitKeyOf(CreateAuthHandler);
const createUserRateLimitKey = rateLimitKeyOf(CreateUserHandler);
const createUserIdempotencyKey = idempotencyKeyOf(CreateUserHandler);
const createRoleIdempotencyKey = idempotencyKeyOf(CreateRoleHandler);

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
      sessionPrincipalStore.run(
        { id: 'alice', type: 'user', tenant: 'tenant_a' },
        () => createUserIdempotencyKey(ctx),
      );

    const rateLimitKey = (ctx: IPipelineContext) =>
      sessionPrincipalStore.run(
        { id: 'alice', type: 'user', tenant: 'tenant_a' },
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

  it('limits logout per source address and never keys on the refresh token', () => {
    const key = rateLimitKeyOf(RevokeAuthHandler)(
      context(
        new RevokeAuthCommand({
          refreshToken: 'secret-token',
          clientIp: '203.0.113.7',
        }),
        'tenant_a',
      ),
    );

    expect(key).toContain('tenant_a');
    expect(key).toContain('203.0.113.7');
    expect(key).not.toContain('secret-token');
  });

  it('limits user creation per acting principal across target emails', () => {
    const create = (email: string, actor: string) =>
      sessionPrincipalStore.run(
        { id: actor, type: 'user', tenant: 'tenant_a' },
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
    ).toThrow(expect.objectContaining({ dimension: 'caller' }));
  });
});
