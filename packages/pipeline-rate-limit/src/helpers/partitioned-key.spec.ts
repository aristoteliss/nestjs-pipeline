/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ABSENT_SEGMENT, type IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { MissingRateLimitPartitionError } from '../errors/missing-partition.error';
import { createPartitionedRateLimitKeyFactory } from './partitioned-key';

function context(overrides: Partial<IPipelineContext> = {}): IPipelineContext {
  return {
    correlationId: 'corr-1',
    request: {},
    requestType: class CreateOrderCommand {},
    requestName: 'CreateOrderCommand',
    handlerType: class CreateOrderHandler {},
    handlerName: 'CreateOrderHandler',
    requestKind: 'command',
    tenantId: 'tenant-a',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map([['userId', 'user-7']]),
    getBehaviorOptions: () => undefined,
    ...overrides,
  } as unknown as IPipelineContext;
}

const readUserId = (ctx: IPipelineContext) =>
  ctx.items.get('userId') as string | undefined;

describe('createPartitionedRateLimitKeyFactory', () => {
  it('builds a tenant-aware per-caller bucket by default', () => {
    const factory = createPartitionedRateLimitKeyFactory(readUserId);

    expect(factory(context())).toBe('tenant-a:user-7:CreateOrderCommand');
  });

  it('can intentionally omit the tenant partition', () => {
    const factory = createPartitionedRateLimitKeyFactory(readUserId, {
      includeTenant: false,
    });

    expect(factory(context())).toBe('user-7:CreateOrderCommand');
  });

  it('trims an accidentally padded partition before composing the key', () => {
    const factory = createPartitionedRateLimitKeyFactory(() => '  user-7  ');

    expect(factory(context())).toBe('tenant-a:user-7:CreateOrderCommand');
  });

  describe('missing caller partition', () => {
    it('fails closed by default', () => {
      const factory = createPartitionedRateLimitKeyFactory(() => undefined);

      expect(() => factory(context())).toThrow(MissingRateLimitPartitionError);
      expect(() => factory(context())).toThrow(/requires a caller partition/);
    });

    it('falls back to a bucket that is still scoped to the tenant', () => {
      // The previous fallback returned a bare request name, so an anonymous
      // caller in one tenant could exhaust the quota of every other tenant.
      const factory = createPartitionedRateLimitKeyFactory(() => undefined, {
        onMissingPartition: 'request',
      });

      expect(factory(context())).toBe('tenant-a:CreateOrderCommand');
      expect(factory(context({ tenantId: 'tenant-b' }))).toBe(
        'tenant-b:CreateOrderCommand',
      );
    });

    it('falls back to request name without tenant when includeTenant is false', () => {
      const factory = createPartitionedRateLimitKeyFactory(() => undefined, {
        onMissingPartition: 'request',
        includeTenant: false,
      });

      expect(factory(context())).toBe('CreateOrderCommand');
    });
  });

  describe('missing tenant', () => {
    it('fails closed when tenant partitioning was requested', () => {
      // includeTenant previously meant "include if present", so a missing tenant
      // silently produced a key with the isolation domain removed.
      const factory = createPartitionedRateLimitKeyFactory(readUserId);

      expect(() => factory(context({ tenantId: undefined }))).toThrow(
        MissingRateLimitPartitionError,
      );
      expect(() => factory(context({ tenantId: undefined }))).toThrow(
        /requires a tenant partition/,
      );
    });

    it('is allowed when the deployment declares itself single-tenant', () => {
      const factory = createPartitionedRateLimitKeyFactory(readUserId, {
        includeTenant: false,
      });

      expect(factory(context({ tenantId: undefined }))).toBe(
        'user-7:CreateOrderCommand',
      );
    });

    it('can keep the tenant segment optional when explicitly requested', () => {
      const factory = createPartitionedRateLimitKeyFactory(readUserId, {
        requireTenant: false,
      });

      expect(factory(context({ tenantId: undefined }))).toBe(
        `${ABSENT_SEGMENT}:user-7:CreateOrderCommand`,
      );
    });
  });

  describe('delimiter safety', () => {
    it('keeps a tenant containing a separator distinct from a principal containing one', () => {
      const factory = createPartitionedRateLimitKeyFactory(readUserId);

      const splitTenant = factory(
        context({ tenantId: 'a:b', items: new Map([['userId', 'c']]) }),
      );
      const splitPrincipal = factory(
        context({ tenantId: 'a', items: new Map([['userId', 'b:c']]) }),
      );

      expect(splitTenant).not.toBe(splitPrincipal);
    });

    it.each([
      ['a\\', 'b'],
      ['a', '\\b'],
      [':x', 'y'],
      ['x', ':y'],
    ])('never collapses tenant %j with principal %j', (tenantId, userId) => {
      const factory = createPartitionedRateLimitKeyFactory(readUserId);
      const swapped = createPartitionedRateLimitKeyFactory(readUserId);

      expect(
        factory(context({ tenantId, items: new Map([['userId', userId]]) })),
      ).not.toBe(
        swapped(
          context({ tenantId: userId, items: new Map([['userId', tenantId]]) }),
        ),
      );
    });

    it('distinguishes an absent tenant from a literally empty one', () => {
      const factory = createPartitionedRateLimitKeyFactory(readUserId, {
        requireTenant: false,
      });

      expect(factory(context({ tenantId: undefined }))).not.toBe(
        factory(context({ tenantId: '' })),
      );
    });
  });
});
