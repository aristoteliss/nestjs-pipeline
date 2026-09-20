/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { sessionUserStore } from '@common/context/session-user.store';
import type { SessionUser } from '@common/types/SessionUser';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { MissingIdempotencyPartitionError } from '@nestjs-pipeline/idempotency';
import { describe, expect, it } from 'vitest';
import { createRoleIdempotencyKey } from '../../../roles/cqrs/commands/create-role.handler';
import { createUserIdempotencyKey } from '../../../users/cqrs/commands/create-user.handler';

type KeyFactory = (ctx: IPipelineContext) => string;

const session = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: 'alice',
  principalType: 'user',
  tenant: 'tenant_a',
  ...overrides,
});

function keyFor(
  factory: KeyFactory,
  payload: object,
  tenantId: string | undefined,
  user: SessionUser | undefined,
): string {
  return sessionUserStore.run(user, () =>
    factory({ tenantId, request: payload } as unknown as IPipelineContext),
  );
}

describe('create idempotency security scope', () => {
  const cases = [
    {
      name: 'user creation',
      factory: createUserIdempotencyKey,
      payload: { email: 'same@example.test' },
      action: 'user.create',
    },
    {
      name: 'role creation',
      factory: createRoleIdempotencyKey,
      payload: { name: 'same-role' },
      action: 'role.create',
    },
  ] as const;

  for (const { name, factory, payload, action } of cases) {
    describe(name, () => {
      const key = (tenantId?: string, user?: SessionUser) =>
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
        expect(key('tenant_a', session({ principalType: 'user' }))).not.toBe(
          key('tenant_a', session({ principalType: 'service' })),
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
        expect(() =>
          key('tenant_a', session({ principalType: undefined })),
        ).toThrow(missing('principal'));
      });

      it('escapes a separator in the discriminator rather than colliding', () => {
        const withSeparator = keyFor(
          factory,
          { ...payload, email: 'a:b@example.test', name: 'a:b' },
          'tenant_a',
          session(),
        );

        expect(withSeparator).toContain('a\\:b');
      });

      it('ignores a caller-supplied identity in the request payload', () => {
        const spoofed = sessionUserStore.run(session(), () =>
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
