/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { MissingIdempotencyPartitionError } from '../errors/missing-partition.error';
import {
  createPartitionedIdempotencyKeyFactory,
  type PartitionedIdempotencyKeyOptions,
} from './partitioned-key';

function ctx(
  overrides: { tenantId?: string; request?: unknown } = {},
): IPipelineContext {
  return {
    tenantId: 'tenant_a',
    requestName: 'CreateOrderCommand',
    request: { ref: 'order-1' },
    ...overrides,
  } as unknown as IPipelineContext;
}

const base: PartitionedIdempotencyKeyOptions = {
  principal: () => 'alice',
  operation: (c) => (c.request as { ref?: string }).ref,
};

describe('createPartitionedIdempotencyKeyFactory', () => {
  it('partitions by tenant, principal, action and operation', () => {
    const key = createPartitionedIdempotencyKeyFactory(base)(ctx());

    expect(key).toBe('tenant_a:alice:CreateOrderCommand:order-1');
  });

  it('leads with the namespace version and uses an explicit action', () => {
    const key = createPartitionedIdempotencyKeyFactory({
      ...base,
      version: 'v1',
      action: 'order.create',
    })(ctx());

    expect(key).toBe('v1:tenant_a:alice:order.create:order-1');
  });

  it('keeps multi-segment principals apart, so a service never shares a user namespace', () => {
    const asUser = createPartitionedIdempotencyKeyFactory({
      ...base,
      principal: () => ['user', 'alice'],
    })(ctx());
    const asService = createPartitionedIdempotencyKeyFactory({
      ...base,
      principal: () => ['service', 'alice'],
    })(ctx());

    expect(asUser).toBe('tenant_a:user:alice:CreateOrderCommand:order-1');
    expect(asService).not.toBe(asUser);
  });

  it('escapes separators so different tuples cannot collide on one key', () => {
    const factory = (principal: string, ref: string) =>
      createPartitionedIdempotencyKeyFactory({
        principal: () => principal,
        operation: () => ref,
      })(ctx());

    expect(factory('a:b', 'c')).not.toBe(factory('a', 'b:c'));
  });

  it('isolates the same principal and operation across tenants', () => {
    const factory = createPartitionedIdempotencyKeyFactory(base);

    expect(factory(ctx({ tenantId: 'tenant_a' }))).not.toBe(
      factory(ctx({ tenantId: 'tenant_b' })),
    );
  });

  it('fails closed without a tenant', () => {
    expect(() =>
      createPartitionedIdempotencyKeyFactory(base)(
        ctx({ tenantId: undefined }),
      ),
    ).toThrow(
      expect.objectContaining({
        name: MissingIdempotencyPartitionError.name,
        dimension: 'tenant',
      }),
    );
  });

  it('omits the tenant only when told the deployment is single-tenant', () => {
    const key = createPartitionedIdempotencyKeyFactory({
      ...base,
      includeTenant: false,
    })(ctx({ tenantId: undefined }));

    expect(key).toBe('alice:CreateOrderCommand:order-1');
  });

  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
    ['whitespace', '   '],
    ['an empty segment list', []],
    ['a list with a blank segment', ['user', ' ']],
    ['a list with a non-string segment', ['user', 123 as unknown as string]],
  ])(
    'fails closed when the principal is %s, with no shared fallback',
    (_, principal) => {
      expect(() =>
        createPartitionedIdempotencyKeyFactory({
          ...base,
          principal: () => principal as string | string[] | undefined,
        })(ctx()),
      ).toThrow(
        expect.objectContaining({
          name: MissingIdempotencyPartitionError.name,
          dimension: 'principal',
        }),
      );
    },
  );

  it('fails closed on a missing operation by default', () => {
    expect(() =>
      createPartitionedIdempotencyKeyFactory(base)(ctx({ request: {} })),
    ).toThrow(
      expect.objectContaining({
        name: MissingIdempotencyPartitionError.name,
        dimension: 'operation',
      }),
    );
  });

  it('skips deduplication for a missing operation when configured for an optional key', () => {
    const key = createPartitionedIdempotencyKeyFactory({
      ...base,
      onMissingOperation: 'skip',
    })(ctx({ request: {} }));

    expect(key).toBeUndefined();
  });

  it('still requires a principal when the operation is optional', () => {
    expect(() =>
      createPartitionedIdempotencyKeyFactory({
        ...base,
        principal: () => undefined,
        onMissingOperation: 'skip',
      })(ctx({ request: {} })),
    ).toThrow(MissingIdempotencyPartitionError);
  });
});
