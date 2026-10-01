/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { sessionPrincipalStore } from '@common/context/session-principal.store.js';
import type { SessionPrincipal } from '@common/types/session-principal.js';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import {
  IdempotencyBehavior,
  type IdempotencyBehaviorOptions,
  MissingIdempotencyPartitionError,
} from '@nestjs-pipeline/idempotency';
import { describe, expect, it } from 'vitest';
import { CreateRoleHandler } from '../src/roles/application/cqrs/commands/create-role.handler.js';
import { CreateUserHandler } from '../src/users/application/cqrs/commands/create-user.handler.js';
import { declaredOptions } from './support/declared-options.js';

type KeyFactory = (ctx: IPipelineContext) => string | undefined;

const keyFactoryOf = (handler: Parameters<typeof declaredOptions>[0]) =>
  declaredOptions<Required<IdempotencyBehaviorOptions>>(
    handler,
    IdempotencyBehavior,
  ).keyFactory as KeyFactory;

const session = (
  overrides: Partial<SessionPrincipal> = {},
): SessionPrincipal => ({
  id: 'alice',
  type: 'user',
  tenant: 'tenant_a',
  ...overrides,
});

function keyFor(
  factory: KeyFactory,
  payload: object,
  tenantId: string | undefined,
  user: SessionPrincipal | undefined,
): string | undefined {
  return sessionPrincipalStore.run(user, () =>
    factory({ tenantId, request: payload } as unknown as IPipelineContext),
  );
}

describe('create idempotency security scope', () => {
  const cases = [
    {
      name: 'user creation',
      factory: keyFactoryOf(CreateUserHandler),
      payload: { email: 'same@example.test', idempotencyKey: 'op-1' },
      action: 'user.create',
    },
    {
      name: 'role creation',
      factory: keyFactoryOf(CreateRoleHandler),
      payload: { name: 'same-role', idempotencyKey: 'op-1' },
      action: 'role.create',
    },
  ] as const;

  for (const { name, factory, payload, action } of cases) {
    describe(name, () => {
      const key = (tenantId?: string, user?: SessionPrincipal) =>
        keyFor(factory, payload, tenantId, user);

      it('partitions by tenant, principal type and principal id', () => {
        expect(key('tenant_a', session())).toContain(
          `tenant_a:user:alice:${action}:`,
        );
        expect(key('tenant_a', session())).not.toBe(
          key('tenant_a', session({ id: 'bob' })),
        );
        expect(key('tenant_a', session())).not.toBe(key('tenant_b', session()));
      });

      it('separates a service principal from a user sharing the same id', () => {
        expect(key('tenant_a', session({ type: 'user' }))).not.toBe(
          key('tenant_a', session({ type: 'service' })),
        );
      });

      it('carries a namespace version so a key shape change is deliberate', () => {
        expect(key('tenant_a', session())).toMatch(/^v1:tenant_a:/);
      });

      const missing = (dimension: string) =>
        expect.objectContaining({
          name: MissingIdempotencyPartitionError.name,
          dimension,
        });

      it('fails closed without tenant context', () => {
        expect(() => key(undefined, session())).toThrow(missing('tenant'));
      });

      it('fails closed without an authenticated principal', () => {
        expect(() => key('tenant_a', undefined)).toThrow(missing('principal'));
      });

      it('fails closed when the principal carries no explicit type', () => {
        expect(() => key('tenant_a', session({ type: undefined }))).toThrow(
          missing('principal'),
        );
      });

      it('escapes a separator in the operation id rather than colliding', () => {
        const withSeparator = keyFor(
          factory,
          { ...payload, idempotencyKey: 'a:b' },
          'tenant_a',
          session(),
        );

        expect(withSeparator).toContain('a\\:b');
      });

      it('keys the client operation id, not the business identifier', () => {
        expect(key('tenant_a', session())).toMatch(/:op-1$/);
        expect(
          keyFor(
            factory,
            { ...payload, idempotencyKey: 'op-2' },
            'tenant_a',
            session(),
          ),
        ).not.toBe(key('tenant_a', session()));
      });

      it('skips deduplication when the client sends no operation id', () => {
        const { idempotencyKey: _omitted, ...withoutKey } = payload;

        expect(
          keyFor(factory, withoutKey, 'tenant_a', session()),
        ).toBeUndefined();
      });

      it('ignores a caller-supplied identity in the request payload', () => {
        const spoofed = sessionPrincipalStore.run(session(), () =>
          factory({
            tenantId: 'tenant_a',
            request: { ...payload, sessionUser: { id: 'attacker' } },
          } as unknown as IPipelineContext),
        );

        expect(spoofed).toBe(key('tenant_a', session()));
        expect(spoofed).not.toContain('attacker');
      });
    });
  }
});
